// recharts(SVG) 차트를 PNG로 내려받는다. container 안의 첫 <svg>를 직렬화해 canvas로 래스터화.
// 다크/라이트 배경을 자동 반영하고 2배 해상도로 렌더한다. (lightweight-charts는 canvas라 별도.)
export function downloadChartPng(container, filename = 'upquant-chart.png') {
  if (!container) return
  const svg = container.querySelector('svg')
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))

  const clone = svg.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', w)
  clone.setAttribute('height', h)

  const dark = document.documentElement.classList.contains('dark')
  const xml = new XMLSerializer().serializeToString(clone)
  const svg64 = window.btoa(unescape(encodeURIComponent(xml)))

  const img = new Image()
  img.onload = () => {
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = dark ? '#1a2234' : '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0, w, h)
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    })
  }
  img.src = 'data:image/svg+xml;base64,' + svg64
}
