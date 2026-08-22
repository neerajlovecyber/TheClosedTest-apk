import { db } from "../db"
import { apps, matches, messages, proofs, reports } from "../db/schema"
import { asc, eq, inArray, not, or } from "drizzle-orm"

async function main() {
  console.log("🔍 Scanning for duplicate apps in database...")

  // Fetch all active apps sorted by creation date ascending (oldest first)
  const allAppsList = await db.query.apps.findMany({
    where: not(eq(apps.status, "archived")),
    with: {
      user: true,
    },
    orderBy: [asc(apps.createdAt)],
  })

  console.log(`📊 Found ${allAppsList.length} total active app records.`)

  const seenPackages = new Map<string, typeof allAppsList[0]>()
  const duplicateApps: typeof allAppsList = []

  for (const appItem of allAppsList) {
    const pkg = appItem.packageName.toLowerCase().trim()
    if (seenPackages.has(pkg)) {
      duplicateApps.push(appItem)
    } else {
      seenPackages.set(pkg, appItem)
    }
  }

  if (duplicateApps.length === 0) {
    console.log("✅ No duplicate apps found! All package names are unique.")
    process.exit(0)
  }

  console.log(`\n⚠️ Found ${duplicateApps.length} duplicate app entries:`)
  for (const dup of duplicateApps) {
    const original = seenPackages.get(dup.packageName.toLowerCase().trim())!
    console.log(
      `  - DUPLICATE App ID: ${dup.id} | Title: "${dup.title}" | Package: ${dup.packageName} | Owner: ${dup.user?.email || dup.userId} | Created: ${dup.createdAt}`,
    )
    console.log(
      `    -> KEEPING Original App ID: ${original.id} | Owner: ${original.user?.email || original.userId} | Created: ${original.createdAt}\n`,
    )
  }

  const duplicateAppIds = duplicateApps.map((a) => a.id)

  console.log("🧹 Cleaning test matches, messages, and proofs for duplicates...")
  const duplicateMatches = await db.query.matches.findMany({
    where: or(
      inArray(matches.app1Id, duplicateAppIds),
      inArray(matches.app2Id, duplicateAppIds),
    ),
    columns: { id: true },
  })

  const duplicateMatchIds = duplicateMatches.map((m) => m.id)
  if (duplicateMatchIds.length > 0) {
    await db.delete(proofs).where(inArray(proofs.matchId, duplicateMatchIds))
    await db.delete(messages).where(inArray(messages.matchId, duplicateMatchIds))
    await db.delete(matches).where(inArray(matches.id, duplicateMatchIds))
    console.log(`   Deleted ${duplicateMatchIds.length} related match records.`)
  }

  await db.delete(reports).where(inArray(reports.targetId, duplicateAppIds))
  const deleted = await db.delete(apps).where(inArray(apps.id, duplicateAppIds)).returning()

  console.log(`\n🎉 Successfully removed ${deleted.length} duplicate app(s)!`)
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ Error cleaning duplicate apps:", err)
  process.exit(1)
})
