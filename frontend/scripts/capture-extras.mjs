// AI 전략 모달(모달 영역만) + 안내 팝업(도움말·분석 가이드, 풀페이지) 캡처.
// 사용: cd frontend && node scripts/capture-extras.mjs   (기본 https://www.skku.site)
import { chromium } from 'playwright'
import fs from 'fs'

const BASE = process.env.CAP_BASE || 'https://www.skku.site'
const OUT = process.env.CAP_OUT || 'screenshots-extra'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

// ── 로그인 ──
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForSelector('#login-username', { timeout: 20000 })
await page.fill('#login-username', 'test')
await page.fill('#login-password', 'test')
await Promise.all([
  page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 }),
  page.click('button[type=submit]'),
])
await page.waitForTimeout(2000)
console.log('logged in')

// ── AI 전략 모달 (모달 영역만) ──
try {
  await page.goto(`${BASE}/trends`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(3000)
  await page.click('button[title="AI 투자 전략 리포트 (Gemini)"]')
  const modal = page.locator('[class*="max-w-2xl"]').first()
  await modal.waitFor({ timeout: 15000 })
  // 리포트 3개 생성될 때까지(PageLoading 문구 사라짐), 최대 150s
  await page.waitForFunction(() => {
    const m = document.querySelector('[class*="max-w-2xl"]')
    return m && !m.innerText.includes('데이터를 불러오는 중')
  }, { timeout: 150000 }).catch(() => {})
  await page.waitForTimeout(2500)
  // 모달의 높이 제한·내부 스크롤을 풀어 리포트 3개 전체가 한 장에 나오게
  await page.evaluate(() => {
    const m = document.querySelector('[class*="max-w-2xl"]')
    if (m) m.style.maxHeight = 'none'
    const sc = m && m.querySelector('[class*="overflow-y-auto"]')
    if (sc) { sc.style.overflow = 'visible'; sc.style.maxHeight = 'none' }
  })
  await page.waitForTimeout(800)
  await modal.screenshot({ path: `${OUT}/ai-strategy-modal.png` })
  console.log('captured ai-strategy-modal')
} catch (e) { console.log('FAIL modal', e.message) }

// ── 안내 팝업 (도움말·분석 가이드) — 풀페이지 ──
for (const p of [{ name: 'help', url: '/help' }, { name: 'guide', url: '/guide' }]) {
  try {
    await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(3000)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${OUT}/popup-${p.name}.png`, fullPage: true })
    console.log('captured popup-' + p.name)
  } catch (e) { console.log('FAIL popup', p.name, e.message) }
}

await browser.close()
console.log('done →', OUT)
