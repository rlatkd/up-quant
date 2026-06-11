// 분석 가이드용 스크린샷 자동 캡처 — 실제 앱(로그인 후)에서 각 정량 분석 차트를 찍어 public/guide/*.png 로 저장.
// 사용: 백엔드(:8000)·프론트(:5173) 모두 실행 중인 상태에서 `node scripts/capture-guide.mjs`.
import { chromium } from 'playwright'
import fs from 'fs'

const BASE = process.env.CAP_BASE || 'http://localhost:5173'
const OUT = 'public/guide'
fs.mkdirSync(OUT, { recursive: true })

// (name, 경로, 차트 제목 앵커) — 같은 경로는 한 번만 이동하고 앵커로 스크롤해 찍는다.
const TARGETS = [
  { name: 'network',   url: '/research/structure', anchor: '상관 네트워크' },
  { name: 'cluster',   url: '/research/structure', anchor: 'K-means 군집' },
  { name: 'pca',       url: '/research/regime',    anchor: 'PCA 시장 요인' },
  { name: 'regime',    url: '/research/regime',    anchor: '시장 국면 탐지' },
  { name: 'momentum',  url: '/research/factor',    anchor: '횡단면 모멘텀' },
  { name: 'pairs',     url: '/research/factor',    anchor: '공적분 페어트레이딩' },
  { name: 'markowitz', url: '/strategy/portfolio', anchor: '효율적 경계선' },
  { name: 'garch',     url: '/coins/KRW-BTC',      anchor: 'GARCH' },
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

// ── 로그인 (test/test) — 폼은 ~1.4s 연출 후 등장 ──
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.waitForSelector('#login-username', { timeout: 20000 })
await page.fill('#login-username', 'test')
await page.fill('#login-password', 'test')
await Promise.all([
  page.waitForURL(u => !u.toString().includes('/login'), { timeout: 20000 }),
  page.click('button[type=submit]'),
])
await page.waitForTimeout(1500)
console.log('logged in')

let lastUrl = ''
for (const t of TARGETS) {
  try {
    if (t.url !== lastUrl) {
      await page.goto(`${BASE}${t.url}`, { waitUntil: 'networkidle', timeout: 90000 })
      await page.waitForSelector('svg', { timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(3500)   // 차트 렌더·애니메이션 정착
      lastUrl = t.url
    }
    const loc = page.getByText(t.anchor, { exact: false }).first()
    // 제목을 뷰포트 '상단'에 붙이고(아래 차트가 화면을 채우게) 약간 여백 — 같은 페이지의 위 섹션이 안 잡히도록.
    await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {})
    await loc.evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' })).catch(() => {})
    await page.evaluate(() => window.scrollBy(0, -80))   // 헤더(sticky)·여백만큼 위로
    await page.waitForTimeout(1300)
    await page.screenshot({ path: `${OUT}/${t.name}.png` })
    console.log('captured', t.name)
  } catch (e) {
    console.log('FAIL', t.name, e.message)
  }
}

await browser.close()
console.log('done')
