#include <node_api.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/mount.h>
#include <sys/file.h>
#include <sys/acl.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define CHAIN_MAX 64
#define READ_MAX (256 * 1024)
#define HANDLE_MAX 256
#define DESCRIPTOR_MAX 256
#define WRAPPER_MAX 4096
#define BASE_FLAGS (O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)
typedef struct { int fd; char name[256]; struct stat identity; } segment;
typedef struct state state;
typedef struct cap {
  state *state;
  struct cap *next;
  struct cap *parent;
  napi_ref parent_ref, lease_ref;
  int fd, kind, active; /* 1 directory, 2 regular reader, 3 writer lease */
  char name[256];
  struct stat identity;
  segment *chain;
  size_t depth;
} cap;
/* Per environment, not process-wide. Failed closes retain their descriptor charge. */
struct state { cap *head; size_t active, descriptors, wrappers; };
static const napi_type_tag cap_tag = {0x678ae4a17da23094ULL, 0x93ead6cf18fe309aULL};

static napi_value error(napi_env env, const char *code) {
  napi_throw_error(env, code, code); /* Never leak a pathname or native error string. */
  return NULL;
}
#define N(call) do { if ((call) != napi_ok) return error(env, "native-api"); } while (0)
static napi_value number(napi_env env, uint32_t n) { napi_value v; N(napi_create_uint32(env, n, &v)); return v; }
static napi_value big(napi_env env, uint64_t n) { napi_value v; N(napi_create_bigint_uint64(env, n, &v)); return v; }
static napi_value text(napi_env env, const char *s) { napi_value v; N(napi_create_string_utf8(env, s, NAPI_AUTO_LENGTH, &v)); return v; }
static napi_value timestamp(napi_env env, struct timespec t) {
  const int64_t scale=1000000000;
  if (t.tv_nsec<0 || t.tv_nsec>=scale || t.tv_sec<INT64_MIN/scale || t.tv_sec>INT64_MAX/scale ||
      (t.tv_sec==INT64_MAX/scale && t.tv_nsec>INT64_MAX%scale)) return error(env,"unsupported-timestamp");
  napi_value v; N(napi_create_bigint_int64(env,(int64_t)t.tv_sec*scale+t.tv_nsec,&v)); return v;
}
#define SET(obj, key, val) do { napi_value _v = (val); if (!_v) return NULL; N(napi_set_named_property(env, obj, key, _v)); } while (0)
static int args(napi_env env, napi_callback_info info, size_t expected, napi_value *argv) {
  size_t argc = expected + 1;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc != expected) {
    error(env, "invalid-argument"); return 0;
  }
  return 1;
}
static int string_arg(napi_env env, napi_value v, char *out, size_t max, int leaf) {
  napi_valuetype type; size_t length = 0, copied = 0;
  if (napi_typeof(env, v, &type) != napi_ok || type != napi_string ||
      napi_get_value_string_utf8(env, v, NULL, 0, &length) != napi_ok || !length || length >= max ||
      napi_get_value_string_utf8(env, v, out, max, &copied) != napi_ok || copied != length || strlen(out) != length ||
      (leaf && (strchr(out, '/') || !strcmp(out, ".") || !strcmp(out, "..")))) {
    error(env, "invalid-argument"); return 0;
  }
  return 1;
}
static int same(const struct stat *a, const struct stat *b) {
  return a->st_dev == b->st_dev && a->st_ino == b->st_ino && a->st_uid == b->st_uid && a->st_mode == b->st_mode;
}
static int unchanged(const struct stat *a, const struct stat *b) {
  return same(a,b) && a->st_gid == b->st_gid && a->st_nlink == b->st_nlink && a->st_size == b->st_size &&
    a->st_mtimespec.tv_sec == b->st_mtimespec.tv_sec && a->st_mtimespec.tv_nsec == b->st_mtimespec.tv_nsec &&
    a->st_ctimespec.tv_sec == b->st_ctimespec.tv_sec && a->st_ctimespec.tv_nsec == b->st_ctimespec.tv_nsec;
}
static cap *get(napi_env env, napi_value value, int closed_ok) {
  bool tagged = false; cap *c = NULL;
  if (napi_check_object_type_tag(env, value, &cap_tag, &tagged) != napi_ok || !tagged ||
      napi_unwrap(env, value, (void **)&c) != napi_ok || !c) { error(env, "invalid-handle"); return NULL; }
  if (!closed_ok && c->fd < 0) { error(env, "closed-handle"); return NULL; }
  return c;
}
static int bound(cap *c) {
  struct stat current;
  if (c->fd < 0 || fstat(c->fd, &current) || !same(&current, &c->identity)) return 0;
  if (c->parent) {
    return bound(c->parent) && !fstatat(c->parent->fd, c->name, &current, AT_SYMLINK_NOFOLLOW) && same(&current, &c->identity);
  }
  for (size_t i = 0; i < c->depth; i++) {
    if (fstat(c->chain[i].fd, &current) || !same(&current, &c->chain[i].identity)) return 0;
    if (i && (fstatat(c->chain[i-1].fd, c->chain[i].name, &current, AT_SYMLINK_NOFOLLOW) || !same(&current, &c->chain[i].identity))) return 0;
  }
  return 1;
}
static int close_owned(cap *c, int fd) {
  /* Never retry: the number may already have been reused. On error retain a
     conservative budget charge until teardown, since release is uncertain. */
  if (close(fd)) return 1;
  if (c->state) c->state->descriptors--;
  return 0;
}
static int release_descriptors(cap *c) {
  int failed=0;
  if (c->chain) {
    /* c->fd aliases the final chain entry; close/count it only here. */
    for (size_t i=0; i<c->depth; i++) if (close_owned(c,c->chain[i].fd)) failed=1;
    free(c->chain); c->chain=NULL; c->depth=0;
  } else if (c->fd>=0) failed=close_owned(c,c->fd);
  c->fd=-1;
  if (c->active) { if (c->state) c->state->active--; c->active=0; }
  return failed;
}
static int release(napi_env env, cap *c) {
  int failed=release_descriptors(c);
  if (c->lease_ref) { napi_delete_reference(env,c->lease_ref); c->lease_ref=NULL; }
  /* parent_ref lives until finalization: closed descendants cannot dereference a freed parent. */
  return failed;
}
static void finalize(napi_env env, void *data, void *hint) {
  (void)hint; cap *c=data;
  release(env,c);
  if (c->parent_ref) napi_delete_reference(env,c->parent_ref);
  if (c->state) {
    cap **p=&c->state->head;
    while (*p && *p!=c) p=&(*p)->next;
    if (*p) { *p=c->next; c->state->wrappers--; }
  }
  free(c);
}
static void cleanup(void *data) {
  state *s=data;
  /* Process/environment teardown is the only implicit lease release. No JS GC lease release. */
  for (cap *c=s->head;c;c=c->next) {
    release_descriptors(c); c->state=NULL;
  }
  free(s);
}
static cap *allocate(napi_env env, int kind) {
  state *s;
  if (napi_get_instance_data(env,(void **)&s)!=napi_ok) { error(env,"native-api"); return NULL; }
  if (s->active>=HANDLE_MAX) { error(env,"handle-limit"); return NULL; }
  if (s->wrappers>=WRAPPER_MAX) { error(env,"wrapper-limit"); return NULL; }
  cap *c=calloc(1,sizeof(*c));
  if (!c) { error(env,"native-memory"); return NULL; }
  c->fd=-1; c->kind=kind; c->active=1; c->state=s;
  c->next=s->head; s->head=c; s->active++; s->wrappers++;
  return c;
}
static int open_owned(napi_env env, cap *c, int parent, const char *name, int flags) {
  if (c->state->descriptors>=DESCRIPTOR_MAX) { error(env,"descriptor-limit"); return -1; }
  int fd=parent<0?open(name,flags):openat(parent,name,flags);
  if (fd<0) { error(env,"native-open"); return -1; }
  c->state->descriptors++;
  return fd;
}
static napi_value wrap(napi_env env, cap *c, napi_value parent) {
  napi_value value;
  if (napi_create_object(env,&value)!=napi_ok || napi_type_tag_object(env,value,&cap_tag)!=napi_ok ||
      (parent && napi_create_reference(env,parent,1,&c->parent_ref)!=napi_ok)) { finalize(env,c,NULL); return error(env,"native-api"); }
  if (napi_wrap(env,value,c,finalize,NULL,NULL)!=napi_ok) { finalize(env,c,NULL); return error(env,"native-api"); }
  if (c->kind==3 && napi_create_reference(env,value,1,&c->lease_ref)!=napi_ok) {
    release(env,c); return error(env,"native-api");
  }
  return value;
}
static napi_value open_root(napi_env env, napi_callback_info info) {
  napi_value argv[2]; char path[4096];
  if (!args(env,info,1,argv) || !string_arg(env,argv[0],path,sizeof(path),0)) return NULL;
  size_t length=strlen(path);
  if (path[0]!='/' || (length>1 && path[length-1]=='/') || strstr(path,"//")) return error(env,"invalid-argument");
  cap *c=allocate(env,1); if (!c) return NULL;
  c->chain=calloc(CHAIN_MAX,sizeof(segment));
  if (!c->chain) { finalize(env,c,NULL); return error(env,"native-memory"); }
  int fd=open_owned(env,c,-1,"/",BASE_FLAGS|O_DIRECTORY);
  if (fd<0) { finalize(env,c,NULL); return NULL; }
  c->chain[0].fd=fd; c->depth=1;
  if (fstat(fd,&c->chain[0].identity)) { finalize(env,c,NULL); return error(env,"native-stat"); }
  char *save=NULL;
  for (char *part=strtok_r(path+1,"/",&save);part;part=strtok_r(NULL,"/",&save)) {
    if (!strcmp(part,".") || !strcmp(part,"..") || strlen(part)>255 || c->depth>=CHAIN_MAX) { finalize(env,c,NULL); return error(env,"invalid-argument"); }
    fd=open_owned(env,c,c->chain[c->depth-1].fd,part,BASE_FLAGS|O_DIRECTORY);
    if (fd<0) { finalize(env,c,NULL); return NULL; }
    segment *seg=&c->chain[c->depth++]; seg->fd=fd; strcpy(seg->name,part);
    if (fstat(fd,&seg->identity)) { finalize(env,c,NULL); return error(env,"native-stat"); }
  }
  c->fd=fd; c->identity=c->chain[c->depth-1].identity;
  if (!bound(c)) { finalize(env,c,NULL); return error(env,"path-changed"); }
  return wrap(env,c,NULL);
}
static int private_file(const struct stat *st) {
  return S_ISREG(st->st_mode) && st->st_uid==getuid() && (st->st_mode&07777)==0600 && st->st_nlink==1 && st->st_size>=0 && st->st_size<=READ_MAX;
}
static napi_value open_child(napi_env env, napi_callback_info info, int kind) {
  napi_value argv[3]; char name[256];
  size_t argc=kind==3?1:2;
  if (!args(env,info,argc,argv)) return NULL;
  cap *p=get(env,argv[0],0); if (!p) return NULL;
  if (p->kind!=1 || !bound(p)) return error(env,"path-changed");
  if (kind==3) strcpy(name,"writer.lock");
  else if (!string_arg(env,argv[1],name,sizeof(name),1)) return NULL;
  cap *c=allocate(env,kind); if (!c) return NULL;
  c->parent=p; strcpy(c->name,name);
  /* Lease creation is intentionally excluded: caller must provision one stable, reviewed inode.
     Never recreate a missing lock on contention, restart or close. */
  c->fd=open_owned(env,c,p->fd,name,BASE_FLAGS|(kind==1?O_DIRECTORY:0));
  if (c->fd<0) { finalize(env,c,NULL); return NULL; }
  if (fstat(c->fd,&c->identity) || (kind!=1 && !private_file(&c->identity)) ||
      (kind==1 && (!S_ISDIR(c->identity.st_mode) || c->identity.st_uid!=getuid() || (c->identity.st_mode&07777)!=0700)) ||
      (kind==3 && c->identity.st_size!=0) || !bound(c)) { finalize(env,c,NULL); return error(env,"unsafe-object"); }
  if (kind==3 && flock(c->fd,LOCK_EX|LOCK_NB)) { int busy=errno==EWOULDBLOCK; finalize(env,c,NULL); return error(env,busy?"ownership-busy":"native-lock"); }
  if (!bound(c)) { finalize(env,c,NULL); return error(env,"path-changed"); }
  return wrap(env,c,argv[0]);
}
static napi_value open_dir(napi_env e,napi_callback_info i) { return open_child(e,i,1); }
static napi_value open_file(napi_env e,napi_callback_info i) { return open_child(e,i,2); }
static napi_value acquire(napi_env e,napi_callback_info i) { return open_child(e,i,3); }

static int flag_mask(void *object, uint32_t *out) {
  acl_flagset_t set;
  if (acl_get_flagset_np(object,&set)) return 0;
  *out=0;
  /* Query all bits through the official API, not private ACL struct layouts. */
  for (unsigned i=0;i<32;i++) {
    uint32_t bit=UINT32_C(1)<<i;
    int present=acl_get_flag_np(set,(acl_flag_t)bit);
    if (present<0) return 0;
    if (present) *out|=bit;
  }
  return 1;
}
static napi_value acl_evidence(napi_env env,int fd) {
  /* Public Libc chain, with syscall failure separated from absent FILESEC_ACL.
     acl_get_fd_np alone conflates those stages into NULL/ENOENT. No private properties.
     Caller has established local APFS; this is not a universal no-ACL inference. */
  struct stat before,extended,after;
  if (fstat(fd,&before)) return error(env,"acl-unavailable");
  filesec_t sec=filesec_init();
  if (!sec) return error(env,"acl-unavailable");
  int present=-1; acl_t acl=NULL;
  if (fstatx_np(fd,&extended,sec) || !unchanged(&before,&extended) ||
      filesec_query_property(sec,FILESEC_ACL,&present) || present<0 ||
      (present && (filesec_get_property(sec,FILESEC_ACL,&acl) || !acl))) {
    if (acl) acl_free(acl);
    filesec_free(sec); return error(env,"acl-unavailable");
  }
  filesec_free(sec);
  if (fstat(fd,&after) || !unchanged(&before,&after)) { if (acl) acl_free(acl); return error(env,"path-changed"); }
  napi_value result=NULL,entries=NULL; uint32_t flags=0;
  if (napi_create_object(env,&result)!=napi_ok || napi_create_array(env,&entries)!=napi_ok || (acl && !flag_mask(acl,&flags))) goto failed;
  napi_value status=text(env,present?"present":"absent");
  if (!status || napi_set_named_property(env,result,"state",status)!=napi_ok) goto failed;
  napi_value f=number(env,flags); if (!f || napi_set_named_property(env,result,"flags",f)!=napi_ok) goto failed;
  for (unsigned n=0;acl;n++) {
    acl_entry_t entry; errno=0;
    int rc=acl_get_entry(acl,n?ACL_NEXT_ENTRY:ACL_FIRST_ENTRY,&entry);
    /* Darwin: zero is success, -1/EINVAL is the documented iteration terminator. */
    if (rc==-1 && errno==EINVAL) break;
    if (rc!=0 || n>=128) goto failed;
    acl_tag_t tag; acl_permset_mask_t permissions; uint32_t ef;
    if (acl_get_tag_type(entry,&tag) || acl_get_permset_mask_np(entry,&permissions) || !flag_mask(entry,&ef)) goto failed;
    void *qualifier=acl_get_qualifier(entry); if (!qualifier) goto failed;
    char principal[33]; const unsigned char *bytes=qualifier;
    for (int j=0;j<16;j++) snprintf(principal+j*2,3,"%02x",bytes[j]);
    acl_free(qualifier);
    napi_value item,t,p,fl,q;
    if (napi_create_object(env,&item)!=napi_ok || !(t=number(env,(uint32_t)tag)) || !(p=big(env,permissions)) ||
        !(fl=number(env,ef)) || !(q=text(env,principal)) || napi_set_named_property(env,item,"tag",t)!=napi_ok ||
        napi_set_named_property(env,item,"permissions",p)!=napi_ok || napi_set_named_property(env,item,"flags",fl)!=napi_ok ||
        napi_set_named_property(env,item,"principal",q)!=napi_ok || napi_set_element(env,entries,n,item)!=napi_ok) goto failed;
  }
  if (napi_set_named_property(env,result,"entries",entries)!=napi_ok) goto failed;
  if (acl) acl_free(acl);
  return result;
failed:
  if (acl) acl_free(acl);
  return error(env,"acl-unavailable");
}
static napi_value evidence(napi_env env,int fd) {
  struct stat st; struct statfs fs;
  if (fstat(fd,&st) || fstatfs(fd,&fs)) return error(env,"native-stat");
  if (!memchr(fs.f_fstypename,0,sizeof(fs.f_fstypename)) || strcmp(fs.f_fstypename,"apfs") ||
      !(fs.f_flags&MNT_LOCAL) || (fs.f_flags&MNT_IGNORE_OWNERSHIP)) return error(env,"unsupported-mount");
  napi_value out; N(napi_create_object(env,&out));
  SET(out,"dev",big(env,(uint64_t)st.st_dev)); SET(out,"ino",big(env,st.st_ino));
  SET(out,"uid",number(env,st.st_uid)); SET(out,"gid",number(env,st.st_gid)); SET(out,"mode",number(env,st.st_mode));
  SET(out,"nlink",big(env,st.st_nlink)); SET(out,"size",big(env,(uint64_t)st.st_size));
  SET(out,"mtimeNs",timestamp(env,st.st_mtimespec));
  SET(out,"ctimeNs",timestamp(env,st.st_ctimespec));
  if (!memchr(fs.f_fstypename,0,sizeof(fs.f_fstypename))) return error(env,"mount-unavailable");
  SET(out,"filesystem",text(env,fs.f_fstypename)); SET(out,"mountFlags",number(env,fs.f_flags));
  SET(out,"fsid0",number(env,(uint32_t)fs.f_fsid.val[0])); SET(out,"fsid1",number(env,(uint32_t)fs.f_fsid.val[1]));
  SET(out,"acl",acl_evidence(env,fd));
  struct stat end; struct statfs fs_end;
  if (fstat(fd,&end) || !unchanged(&st,&end) || fstatfs(fd,&fs_end) ||
      fs.f_flags!=fs_end.f_flags || memcmp(&fs.f_fsid,&fs_end.f_fsid,sizeof(fs.f_fsid))) return error(env,"path-changed");
  return out;
}
static napi_value inspect(napi_env env,napi_callback_info info) {
  napi_value argv[2]; if (!args(env,info,1,argv)) return NULL;
  cap *c=get(env,argv[0],0); if (!c) return NULL;
  if (!bound(c)) return error(env,"path-changed");
  napi_value result=evidence(env,c->fd); if (!result) return NULL;
  if (!bound(c)) return error(env,"path-changed");
  return result;
}
static napi_value ancestors(napi_env env,napi_callback_info info) {
  napi_value argv[2],out; if (!args(env,info,1,argv)) return NULL;
  cap *c=get(env,argv[0],0); if (!c) return NULL;
  if (!c->chain || !bound(c)) return error(env,"path-changed");
  N(napi_create_array_with_length(env,c->depth-1,&out));
  for (size_t i=0;i+1<c->depth;i++) { napi_value item=evidence(env,c->chain[i].fd); if (!item) return NULL; N(napi_set_element(env,out,(uint32_t)i,item)); }
  if (!bound(c)) return error(env,"path-changed");
  return out;
}
static napi_value read_bounded(napi_env env,napi_callback_info info) {
  napi_value argv[3]; double max_number;
  if (!args(env,info,2,argv)) return NULL;
  cap *c=get(env,argv[0],0); if (!c) return NULL;
  if (napi_get_value_double(env,argv[1],&max_number)!=napi_ok || !(max_number>=1 && max_number<=READ_MAX) ||
      max_number!=(uint32_t)max_number || c->kind!=2) return error(env,"invalid-argument");
  uint32_t max=(uint32_t)max_number;
  struct stat before,after;
  if (!bound(c) || fstat(c->fd,&before) || !private_file(&before) || before.st_size>max) return error(env,"unsafe-object");
  /* Evidence accompanies the read on the same descriptor; this primitive does not decide policy. */
  napi_value pre=evidence(env,c->fd); if (!pre) return NULL;
  unsigned char *buffer=malloc((size_t)max+1); if (!buffer) return error(env,"native-memory");
  size_t length=0;
  while (length<max+1) {
    ssize_t n=pread(c->fd,buffer+length,max+1-length,(off_t)length);
    if (n<0) { free(buffer); return error(env,"native-read"); }
    if (!n) break;
    length+=(size_t)n;
  }
  if (length>max || length!=(size_t)before.st_size || fstat(c->fd,&after) || !unchanged(&before,&after) || !bound(c)) {
    free(buffer); return error(env,"path-changed");
  }
  napi_value result,bytes;
  if (napi_create_object(env,&result)!=napi_ok || napi_create_buffer_copy(env,length,buffer,NULL,&bytes)!=napi_ok) { free(buffer); return error(env,"native-api"); }
  free(buffer);
  SET(result,"bytes",bytes); SET(result,"before",pre); SET(result,"after",evidence(env,c->fd));
  if (!bound(c) || fstat(c->fd,&after) || !unchanged(&before,&after)) return error(env,"path-changed");
  return result;
}
static napi_value close_cap(napi_env env,napi_callback_info info) {
  napi_value argv[2],out; if (!args(env,info,1,argv)) return NULL;
  cap *c=get(env,argv[0],1); if (!c) return NULL;
  if (release(env,c)) return error(env,"close-uncertain");
  N(napi_get_undefined(env,&out)); return out;
}
static napi_value init(napi_env env,napi_value exports) {
  state *s=calloc(1,sizeof(*s)); if (!s) return error(env,"native-memory");
  if (napi_set_instance_data(env,s,NULL,NULL)!=napi_ok || napi_add_env_cleanup_hook(env,cleanup,s)!=napi_ok) { free(s); return error(env,"native-api"); }
  const napi_property_descriptor properties[]={
    {"openRoot",0,open_root,0,0,0,napi_default,0}, {"openDirectory",0,open_dir,0,0,0,napi_default,0},
    {"openFile",0,open_file,0,0,0,napi_default,0}, {"acquireWriter",0,acquire,0,0,0,napi_default,0},
    {"inspect",0,inspect,0,0,0,napi_default,0}, {"ancestors",0,ancestors,0,0,0,napi_default,0},
    {"readBounded",0,read_bounded,0,0,0,napi_default,0}, {"close",0,close_cap,0,0,0,napi_default,0}
  };
  N(napi_define_properties(env,exports,sizeof(properties)/sizeof(properties[0]),properties));
  SET(exports,"version",number(env,1)); SET(exports,"napi",number(env,8));
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
