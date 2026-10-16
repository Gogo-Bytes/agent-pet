/* Exact-PID metadata only. No argv, environment, cwd, process enumeration or signals. */
#include <stdio.h>
#include <stdlib.h>
#include <limits.h>
#include <string.h>
#ifdef __APPLE__
#include <libproc.h>
#include <sys/proc_info.h>
#include <sys/proc.h>

static void json_string(const char *value) {
  putchar('"');
  for (const unsigned char *cursor = (const unsigned char *)value; *cursor; cursor++) {
    if (*cursor == '"' || *cursor == '\\') { putchar('\\'); putchar(*cursor); }
    else if (*cursor < 32) printf("\\u%04x", *cursor);
    else putchar(*cursor);
  }
  putchar('"');
}
int main(int argc, char **argv) {
  if (argc != 2 || !argv[1][0] || strlen(argv[1]) > 10) return 1;
  for (const char *p = argv[1]; *p; p++) if (*p < '0' || *p > '9') return 1;
  char *end = NULL; long number = strtol(argv[1], &end, 10);
  if (!end || *end || number <= 0 || number > INT_MAX) return 1;
  int pid = (int)number;
  struct proc_bsdinfo before, after;
  memset(&before, 0, sizeof(before)); memset(&after, 0, sizeof(after));
  if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &before, sizeof(before)) != sizeof(before) ||
      before.pbi_pid != (unsigned int)pid || before.pbi_status == SZOMB) return 1;
  char path[PROC_PIDPATHINFO_MAXSIZE]; memset(path, 0, sizeof(path));
  if (proc_pidpath(pid, path, sizeof(path)) <= 0 || path[0] != '/' || !memchr(path, 0, sizeof(path))) return 1;
  if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &after, sizeof(after)) != sizeof(after) ||
      after.pbi_pid != before.pbi_pid || after.pbi_ppid != before.pbi_ppid || after.pbi_uid != before.pbi_uid ||
      after.pbi_start_tvsec != before.pbi_start_tvsec || after.pbi_start_tvusec != before.pbi_start_tvusec ||
      after.pbi_status == SZOMB) return 1;
  char checked_path[PROC_PIDPATHINFO_MAXSIZE]; memset(checked_path, 0, sizeof(checked_path));
  if (proc_pidpath(pid, checked_path, sizeof(checked_path)) <= 0 || !memchr(checked_path, 0, sizeof(checked_path)) ||
      strcmp(path, checked_path) != 0) return 1;
  printf("{\"pid\":%u,\"ppid\":%u,\"uid\":%u,\"startSeconds\":%llu,\"startMicroseconds\":%llu,\"executable\":",
    before.pbi_pid, before.pbi_ppid, before.pbi_uid, (unsigned long long)before.pbi_start_tvsec,
    (unsigned long long)before.pbi_start_tvusec);
  json_string(path); puts("}"); return 0;
}
#else
int main(void) { return 1; }
#endif
