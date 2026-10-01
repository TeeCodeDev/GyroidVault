const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const NODE_GLOBALS = new Set([
  'console', 'process', 'require', 'module', 'exports', '__dirname', '__filename',
  'Buffer', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'setImmediate', 'clearImmediate', 'queueMicrotask',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error',
  'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'EvalError',
  'Promise', 'JSON', 'Math', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'BigInt', 'Intl',
  'URL', 'URLSearchParams', 'fetch', 'Headers', 'Request', 'Response', 'Blob', 'FormData',
  'undefined', 'NaN', 'Infinity', 'globalThis', 'global',
  'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'ArrayBuffer', 'DataView',
  'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal', 'Event', 'EventTarget'
]);

const BROWSER_GLOBALS = new Set([
  'console', 'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
  'fetch', 'FormData', 'URLSearchParams', 'URL', 'Blob', 'File', 'FileReader',
  'Image', 'Audio', 'CustomEvent', 'Event', 'EventTarget', 'MutationObserver',
  'IntersectionObserver', 'ResizeObserver', 'alert', 'confirm', 'prompt', 'history',
  'screen', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
  'DOMParser', 'XMLSerializer',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error',
  'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'EvalError',
  'Promise', 'JSON', 'Math', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'BigInt', 'Intl',
  'undefined', 'NaN', 'Infinity', 'globalThis',
  'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array',
  'Float32Array', 'Float64Array', 'ArrayBuffer', 'DataView', 'TextEncoder', 'TextDecoder',
  'XMLHttpRequest', 'WebSocket', 'Worker',
  // GyroidVault frontend globals
  'API', 'UI', 'App', 'Viewer', 'lucide', 'THREE', 'OcctImportJs', 'bootstrap', 'GCodePreview', 'fflate'
]);

class Scope {
  constructor(parent = null, isFunctionScope = false) {
    this.parent = parent;
    this.isFunctionScope = isFunctionScope || !parent;
    this.bindings = new Set();
  }
  declare(name, isVar = false) {
    if (isVar && !this.isFunctionScope && this.parent) {
      this.parent.declare(name, true);
    } else {
      this.bindings.add(name);
    }
  }
  has(name) {
    if (this.bindings.has(name)) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }
}

function extractBindings(pattern, scope, isVar = false) {
  if (!pattern) return;
  switch (pattern.type) {
    case 'Identifier':
      scope.declare(pattern.name, isVar);
      break;
    case 'AssignmentPattern':
      extractBindings(pattern.left, scope, isVar);
      break;
    case 'RestElement':
      extractBindings(pattern.argument, scope, isVar);
      break;
    case 'ArrayPattern':
      for (const el of pattern.elements) {
        if (el) extractBindings(el, scope, isVar);
      }
      break;
    case 'ObjectPattern':
      for (const prop of pattern.properties) {
        if (prop.type === 'Property') {
          extractBindings(prop.value, scope, isVar);
        } else if (prop.type === 'RestElement') {
          extractBindings(prop.argument, scope, isVar);
        }
      }
      break;
  }
}

function checkFileUndeclared(filePath, allowedGlobals) {
  const code = fs.readFileSync(filePath, 'utf8');
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  } catch (err) {
    return [{ name: err.message, line: err.loc ? err.loc.line : 0, col: err.loc ? err.loc.column : 0 }];
  }
  const undeclared = [];

  function walk(node, scope) {
    if (!node || typeof node !== 'object') return;

    switch (node.type) {
      case 'Program': {
        const programScope = new Scope(null, true);
        for (const item of node.body) {
          if (item.type === 'FunctionDeclaration' && item.id) {
            programScope.declare(item.id.name, true);
          }
        }
        for (const item of node.body) walk(item, programScope);
        return;
      }
      case 'BlockStatement': {
        const blockScope = new Scope(scope, false);
        for (const item of node.body) {
          if (item.type === 'FunctionDeclaration' && item.id) {
            blockScope.declare(item.id.name, false);
          }
        }
        for (const item of node.body) walk(item, blockScope);
        return;
      }
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const fnScope = new Scope(scope, true);
        if (node.type === 'FunctionDeclaration' && node.id) {
          scope.declare(node.id.name, true);
        } else if (node.type === 'FunctionExpression' && node.id) {
          fnScope.declare(node.id.name, false);
        }
        for (const param of node.params) {
          if (param.type === 'AssignmentPattern') {
            walk(param.right, fnScope);
            extractBindings(param.left, fnScope, false);
          } else {
            extractBindings(param, fnScope, false);
          }
        }
        if (node.body.type === 'BlockStatement') {
          for (const item of node.body.body) {
            if (item.type === 'FunctionDeclaration' && item.id) {
              fnScope.declare(item.id.name, true);
            }
          }
          walk(node.body, fnScope);
        } else {
          walk(node.body, fnScope);
        }
        return;
      }
      case 'CatchClause': {
        const catchScope = new Scope(scope, false);
        if (node.param) extractBindings(node.param, catchScope, false);
        walk(node.body, catchScope);
        return;
      }
      case 'VariableDeclaration': {
        const isVar = node.kind === 'var';
        for (const decl of node.declarations) {
          extractBindings(decl.id, scope, isVar);
          if (decl.init) walk(decl.init, scope);
        }
        return;
      }
      case 'ForStatement': {
        const forScope = new Scope(scope, false);
        if (node.init) {
          if (node.init.type === 'VariableDeclaration') {
            const isVar = node.init.kind === 'var';
            for (const decl of node.init.declarations) {
              extractBindings(decl.id, forScope, isVar);
              if (decl.init) walk(decl.init, forScope);
            }
          } else {
            walk(node.init, forScope);
          }
        }
        if (node.test) walk(node.test, forScope);
        if (node.update) walk(node.update, forScope);
        walk(node.body, forScope);
        return;
      }
      case 'ForInStatement':
      case 'ForOfStatement': {
        const forScope = new Scope(scope, false);
        walk(node.right, scope);
        if (node.left.type === 'VariableDeclaration') {
          const isVar = node.left.kind === 'var';
          for (const decl of node.left.declarations) {
            extractBindings(decl.id, forScope, isVar);
          }
        } else {
          walk(node.left, forScope);
        }
        walk(node.body, forScope);
        return;
      }
      case 'MemberExpression': {
        walk(node.object, scope);
        if (node.computed) walk(node.property, scope);
        return;
      }
      case 'Property': {
        if (node.computed) walk(node.key, scope);
        walk(node.value, scope);
        return;
      }
      case 'MethodDefinition': {
        if (node.computed) walk(node.key, scope);
        walk(node.value, scope);
        return;
      }
      case 'ClassDeclaration':
      case 'ClassExpression': {
        if (node.id) scope.declare(node.id.name, false);
        if (node.superClass) walk(node.superClass, scope);
        walk(node.body, scope);
        return;
      }
      case 'UnaryExpression': {
        if (node.operator === 'typeof' && node.argument.type === 'Identifier') {
          return;
        }
        walk(node.argument, scope);
        return;
      }
      case 'LabeledStatement': {
        walk(node.body, scope);
        return;
      }
      case 'BreakStatement':
      case 'ContinueStatement': {
        return;
      }
      case 'Identifier': {
        if (!scope.has(node.name) && !allowedGlobals.has(node.name)) {
          undeclared.push({
            name: node.name,
            line: node.loc ? node.loc.start.line : 0,
            col: node.loc ? node.loc.start.column : 0
          });
        }
        return;
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item.type === 'string') walk(item, scope);
        }
      } else if (child && typeof child.type === 'string') {
        walk(child, scope);
      }
    }
  }

  walk(ast, null);
  return undeclared;
}

function getJsFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === 'vendor' || item.name === 'node_modules') continue;
      results = results.concat(getJsFiles(full));
    } else if (item.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

function checkAllScopes(rootDir) {
  const serverDir = path.join(rootDir, 'server');
  const serverFiles = getJsFiles(serverDir);
  for (const f of serverFiles) {
    const issues = checkFileUndeclared(f, NODE_GLOBALS);
    if (issues.length > 0) {
      const u = issues[0];
      throw new Error(`Undeclared variable or missing import "${u.name}" in ${path.relative(rootDir, f)}:${u.line}:${u.col}`);
    }
  }

  const clientDir = path.join(rootDir, 'public', 'js');
  const clientFiles = getJsFiles(clientDir);
  for (const f of clientFiles) {
    const issues = checkFileUndeclared(f, BROWSER_GLOBALS);
    if (issues.length > 0) {
      const u = issues[0];
      throw new Error(`Undeclared identifier "${u.name}" in ${path.relative(rootDir, f)}:${u.line}:${u.col}`);
    }
  }

  return { serverFilesChecked: serverFiles.length, clientFilesChecked: clientFiles.length };
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const res = checkAllScopes(root);
  console.log(`AST Scope check passed: ${res.serverFilesChecked} server files, ${res.clientFilesChecked} client files verified clean.`);
}

module.exports = {
  checkAllScopes,
  checkFileUndeclared,
  NODE_GLOBALS,
  BROWSER_GLOBALS
};