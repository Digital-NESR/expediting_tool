'use client';

/**
 * The can artwork is an optional public asset, so the card hides it rather than showing a broken
 * image when it is absent. That fallback needs an error handler, which is the only reason any
 * part of the dashboard runs in the browser.
 */
export default function RedBullCanImage() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/red-bull-can.png"
      alt=""
      className="h-6 w-auto object-contain"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}
