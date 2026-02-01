export function validateToken(token: string | null): boolean {
  const expectedToken = process.env.AUTH_TOKEN;

  if (!expectedToken) {
    console.warn("⚠️  AUTH_TOKEN not set, allowing all connections");
    return true;
  }

  return token === expectedToken;
}
