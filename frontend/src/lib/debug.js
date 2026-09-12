// Switch that hides the demo tools.
//
//   ?debug=1  turn on (remembered in this browser)
//   ?debug=0  turn off
//
// Nothing appears on the normal landing page, so the tools cannot surface
// by accident during judging or a live demo.

const KEY = 'synctrip:debug';

export function isDebug() {
  try {
    const param = new URLSearchParams(window.location.search).get('debug');
    if (param === '1' || param === 'true') {
      localStorage.setItem(KEY, '1');
      return true;
    }
    if (param === '0' || param === 'false') {
      localStorage.removeItem(KEY);
      return false;
    }
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
