export function relatedRepositories(
  raw: string | undefined,
  organization: string,
  primary: string,
): string[] {
  if (!raw) return [];
  const values = raw.split(',');
  if (values.length > 8) throw new Error('Invalid related repositories.');
  const result = values.map((value) => {
    const parts = value.split('/');
    if (
      parts.length !== 2 ||
      parts[0]?.toLowerCase() !== organization.toLowerCase() ||
      !/^[a-z][a-z0-9-]{0,63}$/i.test(parts[1] ?? '') ||
      value.toLowerCase() === primary.toLowerCase()
    )
      throw new Error('Invalid related repositories.');
    return organization + '/' + parts[1]!.toLowerCase();
  });
  if (new Set(result).size !== result.length)
    throw new Error('Invalid related repositories.');
  return result.sort();
}

export function repositoryProfile(
  env: NodeJS.ProcessEnv,
  organization: string,
  target: string,
): 'development' | 'delivery' | 'collaboration' {
  const primary = env['MZ_GITHUB_REPOSITORY'];
  const profile =
    env['MZ_GITHUB_PERMISSION_PROFILE'] === 'delivery'
      ? 'delivery'
      : 'development';
  if (!primary) {
    if (env['MZ_GITHUB_RELATED_REPOSITORIES'])
      throw new Error('Missing primary repository.');
    return profile;
  }
  const related = relatedRepositories(
    env['MZ_GITHUB_RELATED_REPOSITORIES'],
    organization,
    primary,
  );
  if (target.toLowerCase() === primary.toLowerCase()) return profile;
  if (related.some((value) => value.toLowerCase() === target.toLowerCase()))
    return 'collaboration';
  throw new Error('Repository is outside the project scope.');
}

export function apiRepository(args: readonly string[]): string | undefined {
  if (args[0] !== 'api') return undefined;
  const valueFlags = new Set([
    '--method',
    '-X',
    '--header',
    '-H',
    '--field',
    '-F',
    '--raw-field',
    '-f',
    '--input',
    '--jq',
    '-q',
    '--template',
    '-t',
    '--cache',
  ]);
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (valueFlags.has(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith('-')) continue;
    const match = /^\/?repos\/([^/]+)\/([^/]+)(?:[/?]|$)/.exec(arg);
    if (match && !match[1]!.includes('{') && !match[2]!.includes('{'))
      return match[1] + '/' + match[2];
    return undefined;
  }
  return undefined;
}
