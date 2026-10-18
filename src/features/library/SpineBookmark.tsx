export function SpineBookmark() {
  return (
    <svg
      className="collection-spine-bookmark"
      viewBox="0 0 28 50"
      aria-hidden="true"
    >
      {/* Dark gold backing */}
      <path
        d="M1 0H27V48L14 38L1 48Z"
        fill="#b78129"
        stroke="#704716"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Main ribbon */}
      <path
        d="M2 0H25V44L14 34.5L2 44Z"
        fill="#d9aa50"
      />

      {/* Left-side highlight */}
      <path
        d="M4 0H8V39L4 42Z"
        fill="#ffedb1"
        opacity=".65"
      />

      {/* Right-side shadow */}
      <path
        d="M22 0H25V44L22 41Z"
        fill="#83551e"
        opacity=".42"
      />

      {/* Ribbon edging */}
      <path
        d="M2 0H25V44L14 34.5L2 44Z"
        fill="none"
        stroke="#f5d487"
        strokeWidth=".7"
      />
    </svg>
  )
}
