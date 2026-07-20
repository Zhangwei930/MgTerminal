import type { TerminalTheme } from '../../../domain/models';

export const uiMatchTerminalThemes: TerminalTheme[] = [
  // ====================================================================,
  // UI-matched terminal themes — background color matched to each built-in,
  // UI theme preset so the terminal blends seamlessly with the app chrome.,
  // ANSI palette based on magiesTerminal-light (for light) / magiesTerminal-dark (for dark).,
  // ====================================================================,
  // Light UI matches,
  { id: 'ui-claude-light', name: 'Claude', type: 'light', colors: {
    background: '#faf6f3', foreground: '#241c18', cursor: '#d97745', selection: '#f3d0bc',
    black: '#241c18', red: '#cf222e', green: '#116329', yellow: '#9a6700',
    blue: '#0b6bcb', magenta: '#8250df', cyan: '#0e7574', white: '#6e7781',
    brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#7d4e00',
    brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#0c7875', brightWhite: '#8c959f',
  }},
  { id: 'ui-snow', name: 'Snow', type: 'light', colors: {
    background: '#f5f7fa', foreground: '#101728', cursor: '#0068d6', selection: '#b3d7ff',
    black: '#101728', red: '#cf222e', green: '#116329', yellow: '#9a6700',
    blue: '#0068d6', magenta: '#8250df', cyan: '#0e7574', white: '#6e7781',
    brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#7d4e00',
    brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#0c7875', brightWhite: '#8c959f',
  }},

  { id: 'ui-pure-white', name: 'Pure White', type: 'light', colors: {
    background: '#ffffff', foreground: '#24292f', cursor: '#0969da', selection: '#add6ff',
    black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#9a6700',
    blue: '#0969da', magenta: '#8250df', cyan: '#0e7574', white: '#6e7781',
    brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#7d4e00',
    brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#0c7875', brightWhite: '#8c959f',
  }},
  { id: 'ui-ivory', name: 'Ivory', type: 'light', colors: {
    background: '#f7f4ed', foreground: '#24292f', cursor: '#b45309', selection: '#fde68a',
    black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#9a6700',
    blue: '#0969da', magenta: '#8250df', cyan: '#0e7574', white: '#6e7781',
    brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#7d4e00',
    brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#0c7875', brightWhite: '#8c959f',
  }},
  { id: 'ui-mist', name: 'Mist', type: 'light', colors: {
    background: '#f6f7f9', foreground: '#24292f', cursor: '#0891b2', selection: '#a5f3fc',
    black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#9a6700',
    blue: '#0969da', magenta: '#8250df', cyan: '#0e7574', white: '#6e7781',
    brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#7d4e00',
    brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#0c7875', brightWhite: '#8c959f',
  }},
  { id: 'ui-mint', name: 'Mint', type: 'light', colors: {
    background: '#f2f8f5', foreground: '#24292f', cursor: '#059669', selection: '#a7f3d0',
    black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#9a6700',
    blue: '#0969da', magenta: '#8250df', cyan: '#0e7574', white: '#6e7781',
    brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#7d4e00',
    brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#0c7875', brightWhite: '#8c959f',
  }},
  { id: 'ui-sand', name: 'Sand', type: 'light', colors: {
    background: '#f4f0eb', foreground: '#24292f', cursor: '#c2410c', selection: '#fed7aa',
    black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#9a6700',
    blue: '#0969da', magenta: '#8250df', cyan: '#0e7574', white: '#6e7781',
    brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#7d4e00',
    brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#0c7875', brightWhite: '#8c959f',
  }},
  { id: 'ui-lavender', name: 'Lavender', type: 'light', colors: {
    background: '#f7f5fa', foreground: '#24292f', cursor: '#7c3aed', selection: '#ddd6fe',
    black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#9a6700',
    blue: '#0969da', magenta: '#8250df', cyan: '#0e7574', white: '#6e7781',
    brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#7d4e00',
    brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#0c7875', brightWhite: '#8c959f',
  }},
  // Dark UI matches,
];
