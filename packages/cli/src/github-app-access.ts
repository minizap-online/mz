export function appSetupAccessInstructions(
  flow: { url: string; localPort: number },
  env: NodeJS.ProcessEnv,
): string {
  const url = new URL(flow.url);
  const heading = 'Open this private setup page: ' + flow.url + '\n';
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname)
  )
    return (
      heading +
      "Use this configured origin in your computer's browser. Keep mz init running until setup finishes.\n"
    );
  const browserPort = url.port ? Number(url.port) : 80;
  if (
    !Number.isSafeInteger(flow.localPort) ||
    flow.localPort < 1 ||
    flow.localPort > 65535
  )
    throw new Error('Invalid setup port.');
  const supplied = env['MZ_SSH_DESTINATION'];
  const valid =
    supplied !== undefined &&
    supplied.length <= 255 &&
    !supplied.startsWith('-') &&
    /^(?:[a-zA-Z0-9_.-]+@)?(?:[a-zA-Z0-9_][a-zA-Z0-9_.-]*|\[[a-fA-F0-9:]+\])$/.test(
      supplied,
    );
  const destination = valid
    ? "'" + supplied + "'"
    : 'YOUR_DEVBOX_SSH_DESTINATION';
  return (
    heading +
    'If your browser is on another machine, run this on your computer in a separate terminal:\n\n  ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:' +
    browserPort +
    ':127.0.0.1:' +
    flow.localPort +
    ' ' +
    destination +
    '\n\n' +
    (valid
      ? ''
      : 'Replace YOUR_DEVBOX_SSH_DESTINATION with the same user@host or SSH alias you normally use (for example devbox). ') +
    "Reuse any -J/-p options required by your normal SSH connection.\nThe -N command stays running without a shell prompt; that is expected. Keep both mz init and this tunnel open.\nOpen the exact localhost setup link above in your computer's browser. The devbox network IP is not the browser address; MZ listens only on devbox loopback.\nIf the browser is on this devbox already, open the link directly. A protected --github-app-file import is also supported.\n"
  );
}
