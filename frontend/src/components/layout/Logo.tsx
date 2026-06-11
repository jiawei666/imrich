export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 145"
      aria-label="I'm Rich"
      className={className}
    >
      <text
        x="20" y="108"
        fontFamily="'Snell Roundhand','Apple Chancery','Zapfino','Segoe Script',cursive"
        fontSize="116" fontWeight="400" fontStyle="italic" letterSpacing="-10"
        fill="#425268"
      >i&apos;m</text>
      <text
        x="170" y="110"
        fontFamily="'Avenir Next',Montserrat,Inter,Arial,sans-serif"
        fontSize="116" fontWeight="850" letterSpacing="-5"
        fill="#B84336"
      >rich</text>
    </svg>
  )
}
