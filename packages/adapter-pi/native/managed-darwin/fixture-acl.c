/* Test-only fixture writer. Not linked into the addon or used as a runtime helper.
 * Parent test tracks every created path. This prefix guard is NOT an OS sandbox. */
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/acl.h>
#include <fcntl.h>
#include <unistd.h>
#include <membership.h>
#include <string.h>
#include <stdio.h>
#include <errno.h>
int main(int argc,char **argv) {
  const char *prefix="/private/tmp/agent-pet-p2b2-";
  if (argc!=3 || strncmp(argv[1],prefix,strlen(prefix))) return 2;
  int fd=open(argv[1],O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC);
  struct stat st;
  if (fd<0 || fstat(fd,&st) || st.st_uid!=getuid() || (!S_ISDIR(st.st_mode) && !S_ISREG(st.st_mode))) return 3;
  if (!strcmp(argv[2],"remove")) {
    filesec_t sec=filesec_init();
    if (!sec || filesec_set_property(sec,FILESEC_ACL,_FILESEC_REMOVE_ACL) || fchmodx_np(fd,sec)) return 7;
    filesec_free(sec); close(fd); return 0;
  }
  int count=!strcmp(argv[2],"empty")?0:!strcmp(argv[2],"multiple")?3:!strcmp(argv[2],"maximum")?128:1;
  int allow=!strcmp(argv[2],"allow-read") || !strcmp(argv[2],"allow-write") || !strcmp(argv[2],"inherit-allow");
  int inherit=!strcmp(argv[2],"inherit-allow") || !strcmp(argv[2],"inherit-deny");
  if (count==1 && !allow && !inherit && strcmp(argv[2],"deny-delete")) { close(fd); return 2; }
  acl_t a=acl_init(count); uuid_t uuid;
  if (!a || mbr_uid_to_uuid(getuid(),uuid)) return 4;
  for (int i=0;i<count;i++) {
    acl_entry_t e; acl_flagset_t flags;
    if (acl_create_entry(&a,&e) || acl_set_tag_type(e,allow?ACL_EXTENDED_ALLOW:ACL_EXTENDED_DENY) ||
        acl_set_qualifier(e,uuid) || acl_set_permset_mask_np(e,allow?(!strcmp(argv[2],"allow-write")?ACL_WRITE_DATA:ACL_READ_DATA):ACL_DELETE) ||
        acl_get_flagset_np(e,&flags) || acl_clear_flags_np(flags)) return 5;
    if (inherit && (acl_add_flag_np(flags,ACL_ENTRY_FILE_INHERIT) || acl_add_flag_np(flags,ACL_ENTRY_DIRECTORY_INHERIT))) return 5;
  }
  int result=acl_set_fd_np(fd,a,ACL_TYPE_EXTENDED);
  acl_free(a); close(fd);
  if (result) { fprintf(stderr,"fixture-acl failed (%d)\n",errno); return 6; }
  return 0;
}
