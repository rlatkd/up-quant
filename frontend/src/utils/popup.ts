// 새 창(가이드·도움말)을 현재 창 기준 화면 중앙에 띄운다.
// 과거엔 width/height만 지정해 OS 기본 위치(보통 좌상단)에 떴다 → left/top을 중앙으로 계산.
// 멀티 모니터에서도 현재 브라우저 창이 있는 화면 기준으로 중앙에 오도록 screenLeft/innerWidth 사용.
export function openCenteredWindow(path: string, name: string, w = 860, h = 900) {
  const dualLeft = window.screenLeft ?? window.screenX
  const dualTop = window.screenTop ?? window.screenY
  const width = window.innerWidth || document.documentElement.clientWidth || window.screen.width
  const height = window.innerHeight || document.documentElement.clientHeight || window.screen.height
  const left = Math.max(0, dualLeft + (width - w) / 2)
  const top = Math.max(0, dualTop + (height - h) / 2)
  return window.open(
    path,
    name,
    `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`,
  )
}
