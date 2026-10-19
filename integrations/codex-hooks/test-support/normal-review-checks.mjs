/** Test harness verdict: native connection and request shape are independent evidence. */
export function normalRoundChecks({ exitCode, before, after, connectedBefore, connectedAfter }) {
  const taskRequests = after.taskResponses - before.taskResponses;
  const titleRequests = after.titleResponses - before.titleResponses;
  const requests = after.responses - before.responses;
  const checks = { exitCode, connected: connectedAfter > connectedBefore, taskRequests, titleRequests,
    requests, rejected: after.rejected - before.rejected, unexpected: after.unexpected - before.unexpected };
  return { ...checks, passed: exitCode === 0 && checks.connected && taskRequests === 1 &&
    (titleRequests === 0 || titleRequests === 1) && requests === taskRequests + titleRequests &&
    checks.rejected === 0 && checks.unexpected === 0 };
}
