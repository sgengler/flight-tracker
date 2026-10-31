// "You are here" marker for the home location: a sky-blue disc with a house,
// distinct from the red used for the selected plane. Static (no animation) so it
// costs nothing on the Pi.
export function createHomeMarkerElement(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:22px;height:22px;pointer-events:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6));';
  el.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="11" cy="11" r="10" fill="#0ea5e9" stroke="#fff" stroke-width="2"/>' +
    '<path d="M11 5.5 L16 9.8 V16 H12.6 V12.6 H9.4 V16 H6 V9.8 Z" fill="#fff"/>' +
    '</svg>';
  return el;
}
