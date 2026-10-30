// Jest stand-in for react-markdown, an ES module CRA's Jest doesn't
// transform. The text renders as one paragraph; `[text](href)` links go
// through the caller's `a` component and `urlTransform`, so course links
// become chips as in the app.
const React = require('react');

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function ReactMarkdown({ children, components = {}, urlTransform = (url) => url }) {
  const text = String(children ?? '');
  const parts = [];
  let last = 0;
  text.replace(LINK, (match, label, href, offset) => {
    if (offset > last) parts.push(text.slice(last, offset));
    const props = { key: offset, href: urlTransform(href), children: label };
    parts.push(components.a ? React.createElement(components.a, props) : React.createElement('a', props));
    last = offset + match.length;
    return match;
  });
  if (last < text.length) parts.push(text.slice(last));
  return React.createElement('p', null, ...parts);
}

module.exports = {
  __esModule: true,
  default: ReactMarkdown,
  defaultUrlTransform: (url) => url,
};
