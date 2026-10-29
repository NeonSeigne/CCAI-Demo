import { buildMuiTheme, resolveRoles } from './schoolTheme';

// A static light theme for breakpoints, transitions and tests. The live theme
// (school colours, light or dark) comes from ThemeContext.
const muiTheme = buildMuiTheme(resolveRoles(undefined, 'light'), 'light');

export default muiTheme;
