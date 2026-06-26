// 페이지별 풀페이지(헤더~푸터) 스크린샷 — 로그인 후 각 라우트를 한 장씩 fullPage로 저장.
// 사용: cd frontend && node scripts/capture-pages.mjs   (대상 기본 https://www.skku.site)
//   로컬 대상: CAP_BASE=http://localhost:5173 node scripts/capture-pages.mjs  (FE·BE 실행 중일 때)
import { chromium } from 'playwright'
import fs from 'fs'

const BASE = process.env.CAP_BASE || 'https://www.skku.site'
const OUT = process.env.CAP_OUT || 'screenshots'
fs.mkdirSync(OUT, { recursive: true })

const PAGES = [
  { name: '01-coins',               url: '/coins/KRW-BTC' },
  { name: '02-trends',              url: '/trends' },
  { name: '03-market-overview',     url: '/market/overview' },
  { name: '04-market-sectors',      url: '/market/sectors' },
  { name: '05-market-screener',     url: '/market/screener' },
  { name: '06-market-compare',      url: '/market/compare' },
  { name: '07-research-structure',  url: '/research/structure' },
  { name: '08-research-regime',     url: '/research/regime' },
  { name: '09-research-factor',     url: '/research/factor' },
  { name: '10-research-risk',       url: '/research/risk' },
  { name: '11-strategy-portfolio',  url: '/strategy/portfolio' },
  { name: '12-strategy-backtest',   url: '/strategy/backtest/ma' },
  { name: '13-strategy-validation', url: '/strategy/validation' },
  { name: '14-system',              url: '/system' },
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

// ── 로그인 (test/test) ──
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

for (const p of PAGES) {
  try {
    await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle', timeout: 120000 })
    // 전역 로딩 게이트(PageLoading)가 사라질 때까지
    await page.waitForFunction(() => !document.body.innerText.includes('데이터를 불러오는 중'), { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(4500)   // 차트·실시간 렌더 정착
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/${p.name}.png`, fullPage: true })
    console.log('captured', p.name)
  } catch (e) {
    console.log('FAIL', p.name, e.message)
  }
}

await browser.close()
console.log('done →', OUT)
