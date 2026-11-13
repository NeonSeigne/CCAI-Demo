/**
 * Answers render Markdown with inline math, where text between two `$`
 * signs is an equation. "$15/hour nets about $1,500" would turn into one
 * squashed formula. A `$` followed by a digit is a price, so escape it;
 * real math ($x^2$, $\frac{a}{b}$) is left alone. Inline code is skipped.
 */
export default function escapeCurrency(line) {
  return line
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/(^|[^\\$])\$(?=\d)/g, '$1\\$')))
    .join('');
}
