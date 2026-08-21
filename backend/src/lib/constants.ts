export const ADMIN_EMAILS = [
  "neerajlovecyber@gmail.com",
  "futureaistudio41@gmail.com",
].map((e) => e.toLowerCase())

export function isUserAdmin(email?: string | null, isDbAdmin?: boolean): boolean {
  if (isDbAdmin) return true
  if (!email) return false
  return ADMIN_EMAILS.includes(email.trim().toLowerCase())
}
