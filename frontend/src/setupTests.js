// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Course data is cached for the session; each test starts with an empty cache.
afterEach(() => {
  // Required here, not imported, so a test file's jest.mock of its dependencies still applies.
  // eslint-disable-next-line global-require
  require('./modules/course/loader').clearCourseCache?.();
});
