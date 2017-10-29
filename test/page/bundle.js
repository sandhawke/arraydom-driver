(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict'

const struct = require('../arraydom/struct.js')
const debug = require('debug')('arraydom-diff')

const tagName   = struct.tagName
const attr      = struct.attr
const attrNames = struct.attrNames

//window.jsdebug = require('debug')
//window.jsdebug.enable('arraydom-diff')

function scalar (x) {
  return (typeof x === 'string' || typeof x === 'number')
}

function patch (t0, steps, doc) {
  if (!doc) doc = document // easy override for 'document' for testing
  
  // refnum[3] is the node with refnum 3, ie at pre-order index 3
  const refnum = buildRefnumArray(t0, steps)

  // while debugging in browser
  if (typeof window !== 'undefined') window.refnum = refnum

  function refOrNew (expr) {
    if (expr.refnum) {
      // allow diffs to have nodes moved around arbitrarily, even
      // though our diff() never does that.  We can't just pass the
      // number here, because we allow numbers (which are later turned
      // into strings) in arraydom trees.
      return refnum[expr]
    }
    return construct(expr, doc)
  }
  
  for (let step of steps) {
    //debug('step', step)
    if (step.method === 'remove') {
      refnum[step.object].remove()
    } else if (step.method === 'appendChild') {
      refnum[step.parent].appendChild(refOrNew(step.child))
    } else if (step.method === 'insertBefore') {
      refnum[step.sibling].parentNode.insertBefore(refOrNew(step.inserted),
                                                   refnum[step.sibling])
    } else if (step.method === 'setAttribute') {
      set(refnum[step.object], step.attribute, step.value)
    } else if (step.method === 'deleteAttribute') {
      unset(refnum[step.object], step.attribute)
    } else throw Error('unknown patch method')
  }
}

// return doc.createElement(...) with the whole tree + attrs
function construct (a, doc) {
  if (typeof a === 'string') return doc.createTextNode(a)
  if (typeof a === 'number') return doc.createTextNode('' + a)
  const e = doc.createElement(tagName(a))
  for (let name of attrNames(a, true, true)) {
    set(e, name, attr(a, name))
  }
  for (let child of a.slice(2)) {
    e.appendChild(construct(child, doc))
  }
  return e
}
//window.construct = construct

/*
  This is interesting because we smoosh .style and .dataset into the key

  set(n, 'a', val)  =>   n.setAttribute('a', val)
  set(n, '$a', val) =>   n.style.a = val
  set(n, '$a-b', val) =>   n.style.aB = val
  set(n. '_a', val) =>   n.dataset.a = val 
*/
function set (node, key, val) {
  if (key[0] === '_') {
    node.dataset[key.slice(1)] = val
  } else if (key[0] === '$') {
    let stylekey = key.slice(1).replace(/-[^-]/g, x => x[1].toUpperCase())
    if (!node.style) {
      console.error('node.style not defined', node)
    }
    node.style[stylekey] = val
    debug('set style.', stylekey, ' = ', val)
  } else {
    // which of these is better?   setAttribute doesn't work when
    // val is a function.
    // xxx node.setAttribute(key, val)
    if (!node) {
      console.error('node not defined', node, key, val)
    }

    // capricious difference between HTML attribute and DOM attribute
    if (key === 'class') key = 'className'
    
    node[key] = val
    debug('set ', key, ' = ', val)
  }
}
function unset (node, key, val) {
  if (key[0] === '_') {
    delete node.dataset[key.slice(1)]
  } else if (key[0] === '$') {
    let stylekey = key.slice(1).replace(/-[^-]/g, x => x[1].toUpperCase())
    delete node.style[stylekey]
  } else {
    node.removeAttribute(key)
  }
}


/*
  Return a sorted array of the refnums used anywhere in the given steps

  Actually we don't need this, since we're no longer using a sparse
  array, but we might switch back to sparse array, so I'm keeping it
  here for now.
*/
function buildRefList (steps) {
  const refs = new Set()
  for (let step of steps) {
    for (let prop of ['object', 'parent', 'child', 'sibling', 'inserted']) {
      if (typeof step[prop] === 'number') refs.add(step[prop])
    }
  }
  const refsArray = Array.from(refs)
  refsArray.sort()
  return refsArray
}

/* 
   Return an array mapping refnum ==> nodes in t0 
*/
function buildRefnumArray (t0) {
  let result = []

  function visit (n) {
    // debug('visiting', n)
    result.push(n)
    let child = n.firstChild
    while (child) {
      visit(child)
      child = child.nextSibling
    }
  }

  visit(t0)
  return result
}


/*
  Compute a set of steps one would have to apply to t0 to get t1
*/
function diff (t0, t1) {
  const steps = []
  let refnum

  function remove (x) {
    //debug('removed called with', x)
    steps.push({ method: 'remove', object: x })
    //debug('PUSHED: ', steps.slice(-1))
  }
  function appendChild (x, child) {
    steps.push({ method: 'appendChild', parent:x, child: child })
  }
  function insertBefore (i, s) {
    steps.push({ method: 'insertBefore', inserted: i, sibling: s })
  }
  function setAttribute (x, k, v) {
    steps.push({ method: 'setAttribute', object:x, attribute:k, value: v})
  }
  function deleteAttribute (x, k) {
    steps.push({ method: 'deleteAttribute', object:x, attribute:k})
  }
  
  function alignable (a, b) {
    if (scalar(a) && scalar(b)) {
      // the DOM supports textContent, but I think it'll slow our
      // algorithm down here, if we don't treat text basically as
      // anchors.  I think apps will be inserting and deleting
      // elements, not textnodes.
      return a === b
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      // we can't change tagNames
      // http://stackoverflow.com/questions/3435871/jquery-how-to-change-tag-name
      if (tagName(a) !== tagName(b)) return false
      // and it seems like a bad idea to change ids.  By forbidding
      // the changing of ids, I think the algorithm will perform a
      // lot better
      if (attr(a, 'id') !== attr(b, 'id')) return false
      // ... anything else?
      return true
    }
    return false
    // debug('cant tell if alignable', a, b)
    // throw Error()
  }

  // Return the index (or -1) of the next sibling in b (>= 
  // minIndex) which is alignable with the given item
  function nextAlignable(element, b, minIndex) {
    for (let jj = minIndex; jj < b.length; jj++) {
      const aligns = alignable(element, b[jj])
      //debug('alignable? ', element, b[jj], aligns)
      if (aligns) return jj
    }
    return -1
  }

  function align (a, b) {
    debug('align', a, b)
    if (!alignable(a,b)) throw Error()  // should never be here
    if (scalar(a)) return
    const refnumSaved = refnum
    adjustAttributes(refnumSaved, a, b)
    let i = 2 // offset of first child ASSUMES attrs
    let j = 2 // offset of first child ASSUMES attrs
    while (i < a.length) {
      let child = a[i]
      refnum++
      debug('starting align loop', i, a[i], j, b[j], refnum)
      let nextj = nextAlignable(child, b, j)
      if (nextj === j) {
        debug('alignable at', i, j)
        align(a[i], b[j])
        i++
        j++
      } else if (nextj === -1) {
        debug('align delete child at', i, refnum)
        // child cannot align with anything in the rest of b, so
        // delete it -- it's of no use to us, sorry.  We don't look
        // for where else in the tree it might be useful.
        debug('calling remove with', refnum)
        remove(refnum)
        refnum += (nodeCount(a[i]) - 1)
        i++
      } else {
        // child CAN align with some later sibling, so create the children 
        // for the interving nodes
        while (j < nextj) {
          debug('align insertBefore ', b[j], refnum)
          insertBefore(deepCopy(b[j]), refnum)
          j++
        }
        // undo that refnum increment, since we didn't actually move this loop
        refnum--
      }
    }
    while (j < b.length) {
      debug('align append children, because ', j, b.length)
      appendChild(refnumSaved, deepCopy(b[j]))
      j++
    }
  }

  function adjustAttributes (refnum, a, b) {
    const old = new Set()
    for (let name of attrNames(a, true, true)) {
      old.add(name)
    }
    for (let name of attrNames(b, true, true)) {
      let val = attr(b, name)
      if (val === null) {
        deleteAttribute(refnum, name)
      } else {
        if (a[name] !== val) {
          setAttribute(refnum, name, val)
        }
      }
      old.delete(name)
    }
    for (let name of old) {
      deleteAttribute(refnum, name)
    }
  }

  if (!alignable(t0, t1)) {
    // or maybe we should use node.replaceChild() for this?
    // otherwise muck around...??
    throw ('Not allowed to change root tagName or id ')
  }

  refnum = 0
  align(t0, t1)
  debug('aligned', t0, t1)
  return steps
}

function deepCopy (a) {
  if (scalar(a)) {
    return a
  }
  if (Array.isArray(a)) {
    const result = []
    for (let aa of a) {
      result.push(deepCopy(aa))
    }
    return result
  }
  if (typeof (a) === 'object') {
    return Object.assign({}, a)
  }
  console.error('unexpected object', a)
  throw Error('no other types implemented')
}

function nodeCount (a) {
  let n = 1
  
  if (Array.isArray(a)) {
    if (scalar(a[1]) || Array.isArray(a[1])) throw Error('missing attrs in slot 1')
    for (let i=2; i<a.length; i++) {
      n += nodeCount(a[i])
    }
  }

  return n
}

module.exports.construct = construct
module.exports.patch = patch
module.exports.diff = diff
module.exports.deepCopy = deepCopy
module.exports.buildRefnumArray = buildRefnumArray

module.exports.nodeCount = nodeCount   // for testing

},{"../arraydom/struct.js":9,"debug":2}],2:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage(){
  try {
    return window.localStorage;
  } catch (e) {}
}

},{"./debug":3}],3:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":4}],4:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = '' + str;
  if (str.length > 10000) return;
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],5:[function(require,module,exports){
'use strict'

const diff = require('arraydom-diff')
const debug = require('debug')('domdriver')

const onchangeSymbol = Symbol('domdriver-watchable-onchange')

function scalar (x) {
  return (typeof x === 'string' || typeof x === 'number')
}

let prevTime = 0
function elapsedDebug () {
  const now = Date.now()
  const hold = prevTime
  prevTime = now
  if (hold) {
    return 'elapsed ms=' + (now - hold)
  } else {
    return '(timing starts)'
  }
}

function create(parent, tree, options) {
  options = options || {}
  if (typeof parent === 'string') {
    if (parent.startsWith('#')) parent = parent.slice(1)
    parent = document.getElementById(parent)
  }

  let lastEvalTime = 0
  let touched = true
  function touch () {
    touched = true
    debug('touched', elapsedDebug())
  }

  let treeCopy
  let elem
  function reset (t) {
    treeCopy = evalFunctions(t, touch)
    elem = diff.construct(treeCopy, document)
    while (parent.firstChild) parent.removeChild(parent.firstChild)
    parent.appendChild(elem)
  }
  reset(tree)

  let stopped = false
  function stop (finalTree) {
    stopped = true
    if (finalTree) reset(finalTree)
  }
  function schedule (callback) {
    if (stopped) return
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(callback)
    } else {
      setTimeout(callback, 30)
    }
  }
  
  function paint (timestamp) {
    const elapsed = timestamp - lastEvalTime
    if (touched || (options.poll && elapsed >= options.poll)) {
      lastEvalTime = timestamp
      try {  // we dont want to kill the loop if there's an error
        const evaldTree = evalFunctions(tree, touch)
        // debug('evaldTree is', evaldTree)
        debug('diffing', elapsedDebug(), treeCopy, evaldTree)
        const delta = diff.diff(treeCopy, evaldTree)
        debug('delta is', delta, elapsedDebug(), window)
        if (!window.debug_deltas) window.debug_deltas = ['debug trace']
        window.debug_deltas.push(delta)
        treeCopy = evaldTree
        diff.patch(elem, delta, document)
        debug('patched', elapsedDebug())
        scrollToScrollPoint()
      } catch (e) {
        console.error(e)
      }
      // should we do this early in case any eval functions change something?
      //
      // Probably, but that doesn't work well, either.   Bug.
      touched = false
    }
    schedule(paint)
  }

  function scrollToScrollPoint () {
    const el = document.getElementsByClassName('scrollPoint')
    // console.log('scrollPoints', el)
    if (el[0]) {
      // Unfortunately, at least in my FF, if I just scrollIntoView
      // immediately, the layout wont be done and we'll be at the
      // wrong place.  How can we tell when all the images are loaded?
      // I guess we could wait for img.onload on each image before
      // this element in the tree?  Ewwwww.
      setTimeout(() => { el[0].scrollIntoView() }, 50)
    }
  }

  function scrollToId (id) {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView()
    }
  }
  
  /*
  function live (db, func, attrs ) {
    const t = ['div', attrs]
    function change (newValue) {
      t.splice(2)
      const out = func(newValue, attrs)
      if (out) {
        t.push(out)
        // debug('t = ', JSON.stringify(t))
        dd.touch
      } else {
        throw Error('domdriver.live function returned falsy')
      }
    }
    db.on('change', change)
    change(db.values())
    return t
  }
  */

  schedule(paint)
  const dd = {}
  //dd.live = live
  dd.touch = touch
  dd.stop = stop
  dd.scrollToId = scrollToId
  // dd.content = tree  // make this read-only, if we do provide it
  return dd
}

// we end up evaling more than necessary -- when any change to any
// data happens, trigger a re-eval of the whole tree.   But it's simple
// and probably good enough.
function evalFunctions (a, onChange) {
  if (!onChange) onChange = () => {}
  if (scalar(a)) {
    return a
  }
  if (Array.isArray(a)) {
    if (typeof a[0] === 'function') {
      const args = a.slice(1)
      for (let arg of args) {
        // In theory we could have the onChange function signal it's
        // only this function that needs to be re-run, not the whole
        // tree.  That would be worthwhile if some data changes
        // frequently with a cheap function and other data changes
        // slowly with an expensive function.  But maybe you can just
        // make those separate domdrivers?
        if (arg && typeof arg.on === 'function') {
          arg.on('change', onChange)
        }
        if (arg && typeof arg === 'object' && 'onchange' in arg) {
          arg.onchange = onChange
        }
        if (arg && typeof arg === 'object' && onchangeSymbol in arg) {
          arg[onchangeSymbol] = onChange
        }
      }
      const output = a[0].apply(null, args)
      // debug('func returned', output)
      return evalFunctions(output, onChange)
    } else {
      const result = []
      let count = 0
      for (let aa of a) {
        if (count++ === 1) {
          if (Array.isArray(aa) || scalar(aa)) {
            // missing the optional {} at index 1, so put it in now,
            // so downstream can always know it's here
            result.push({})
          }
        }
        result.push(evalFunctions(aa, onChange))
      }
      return result
    }
  }
  if (typeof (a) === 'object') {
    return Object.assign({}, a)
  }
  console.error('unexpected object', a)
  return '[error: bad value]'
  // throw Error('no other types implemented')
}

function watchable (target) {
  if (target && onchangeSymbol in target) {
    throw Error('wrapping watchable in watchable')
  }
  const handler = {
    set: (target, property, value, receiver) => {
      // console.log(target, receiver)
      // if (receiver !== target) throw Error('proxy inheritence not supported 2')
      if (value && typeof value === 'object') {
        if (!onchangeSymbol in value) {
          console.log('watchable object property assigned to non-watchable')
        }
      }
      if (target[property] !== value) {
        target[property] = value
        //console.log('set to', value)
        //console.log('onchange', target[onchangeSymbol])
        if (target[onchangeSymbol]) target[onchangeSymbol]()
      }
      return true
    }
  }
  target = target || {}
  target[onchangeSymbol] = null  // indicate we're watchable
  return new Proxy(target || {}, handler)
}

module.exports = create

// for testing
module.exports.evalFunctions = evalFunctions

// for real
module.exports.create = create

module.exports.watchable = watchable

},{"arraydom-diff":1,"debug":6}],6:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
  return (typeof document !== 'undefined' && 'WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage(){
  try {
    return window.localStorage;
  } catch (e) {}
}

},{"./debug":7}],7:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug.debug = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/[\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":8}],8:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000
var m = s * 60
var h = m * 60
var d = h * 24
var y = d * 365.25

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function (val, options) {
  options = options || {}
  var type = typeof val
  if (type === 'string' && val.length > 0) {
    return parse(val)
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ?
			fmtLong(val) :
			fmtShort(val)
  }
  throw new Error('val is not a non-empty string or a valid number. val=' + JSON.stringify(val))
}

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str)
  if (str.length > 10000) {
    return
  }
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str)
  if (!match) {
    return
  }
  var n = parseFloat(match[1])
  var type = (match[2] || 'ms').toLowerCase()
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y
    case 'days':
    case 'day':
    case 'd':
      return n * d
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n
    default:
      return undefined
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  if (ms >= d) {
    return Math.round(ms / d) + 'd'
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h'
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm'
  }
  if (ms >= s) {
    return Math.round(ms / s) + 's'
  }
  return ms + 'ms'
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms'
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name
  }
  return Math.ceil(ms / n) + ' ' + name + 's'
}

},{}],9:[function(require,module,exports){
'use strict'

function attrsPresent (node) {
  const x = node[1]
  return (typeof x === 'object' && !Array.isArray(x))
}

function rawAttrs (node) {
  const x = node[1]
  if (typeof x === 'object' && !Array.isArray(x)) {
    return x
  }
  return {}
}

function children (node) {
  if (attrsPresent(node)) {
    return node.slice(2)
  }
  return node.slice(1)
}

function child (node, index) {
  if (attrsPresent(node)) {
    return node[index + 2]
  }
  return node[index + 1]
}

function numChildren (node) {
  let result = node.length - 1
  if (attrsPresent(node)) result--
  return result
}

function forEachChild (node, f) {
  const from = attrsPresent(node) ? 2 : 1
  for (let i = from; i < node.length; i++) {
    const n = node[i]
    if (typeof n === 'string' || typeof n === 'number' || Array.isArray(n)) {
      f(n)
    } else {
      throw Error('arraydom wrong type value, ' + JSON.stringify(n) + ', index '+ i + ' of ' + JSON.stringify(node), node)
    }
  }
}

function tagName (node) {
  // OF COURSE, we should catch this stuff upsteam, but sometimes...
  if (typeof node[0] !== 'string') throw Error('type of [0] is ' + typeof node + ':' + JSON.stringify(node))
  const parts = node[0].split(' ')
  return parts[0]
}

function embeddedClassNames (node) {
  if (typeof node[0] !== 'string') throw Error('type of [0] is ' + typeof node + ':' + JSON.stringify(node))
  const parts = node[0].split(' ')
  if (parts.length > 1) {
    return parts.slice(1).join(' ')
  }
  return ''
}

function attrNames (node, includeHidden, rawStyle) {
  const a = rawAttrs(node)
  const result1 = Object.getOwnPropertyNames(a)
  if (a['class'] === undefined && embeddedClassNames(node)) {
    result1.push('class')
  }
  const result2 = []
  let hasStyle = false
  for (let key of result1) {
    if (!rawStyle) {
      if (key[0] === '$' || key.startsWith('style.')) {
        hasStyle = true
        continue
      }
    }
    if (key[0] === '_' && !includeHidden) {
      continue
    }
    result2.push(key)
  }
  if (hasStyle) {
    result2.push('style')
  }
  result2.sort()
  return result2
}

function attr (node, key) {
  const a = rawAttrs(node)
  if (key === 'style') {
    const val = []
    let s = (a.style || '').trim()
    if (s.endsWith(';')) {  // remove trailining semi if there is one
      s = s.slice(0, -1)
    }
    if (s) {
      val[0] = s
    }
    for (let sk of Object.getOwnPropertyNames(a)) {
      for (let pre of ['$', 'style.']) {
        if (sk.startsWith(pre)) {
          let k = sk.slice(pre.length)
          val.push(k + ': ' + a[sk])
        }
      }
    }
    val.sort() // mostly just for easier testing
    return val.length ? val.join('; ') : undefined
  } else if (key === 'class') {
    let both = Object.getOwnPropertyNames(classesAsKeys(node))
    both.sort()
    if (both.length === 0) {
      return undefined
    } else {
      return both.join(' ')
    }
  } else {
    return a[key]
  }
}

function classesAsKeys (node) {
  const a = rawAttrs(node)
  let s1 = (a['class'] || '').split(' ')
  let s2 = embeddedClassNames(node).split(' ')
  let both = s1.concat(s2)
  let bothObj = {}
  both.forEach((x) => { if (x) { bothObj[x] = true } })
  return bothObj
}

function walk (node, func) {
  func(node)
  forEachChild(node, (x) => walk(x, func))
}

function walkAttrValues (node, func) {
  walk(node, n => {
    for (let key of attrNames(node)) {
      func(node, key)
    }
  })
}

function find (filter, node, func) {
  if (typeof filter === 'string') {
    filter = (x) => match(node, filter)
  }
  if (filter(node)) func(node)
  forEachChild(node, (x) => find(filter, x, func))
}

function match (node, pattern) {
  let parts = pattern.split(' ')
  for (let part of parts) {
    if (part.startsWith('.')) {
      let target = part.slice(1)
      let classes = classesAsKeys(node)
      if (classes[target]) return true
    } else if (part.startsWith('#')) {
      if (attr(node, 'id') === part.slice(1)) return true
    } else {
      if (tagName(node) === part) return true
    }
  }
  return false
}

function expanded (node) {
  if (typeof node === 'string' || typeof node === 'number') return node
  const result = [ tagName(node),
                   attrsCopy(node) ]
  forEachChild(node, (x) => { result.push(expanded(x)) })
  return result
}

function attrsCopy (node) {
  const result = {}
  for (let key of attrNames(node)) {
    result[key] = attr(node, key)
  }
  return result
}

function compacted (node) {
  if (typeof node === 'string') return node
  const result = [ tagName(node) ]
  const attrObj = {}
  for (let key of attrNames(node)) {
    let val = attr(node, key)
    if (key === 'class') {
      result[0] += ' ' + val
    } else if (key === 'style') {
      if (val.indexOf('"') !== -1 || val.indexOf("'") !== -1) {
        // not safe to split
        attrObj.style = val
      } else {
        let styles = val.split(';')
        for (let line of styles) {
          let lr = line.split(':')
          if (lr.length !== 2) {
            throw Error('having trouble with splitting style value:' +
                        JSON.stringify(val))
          }
          attrObj['$' + lr[0]] = lr[1].trim()
        }
      }
    } else {
      attrObj[key] = val
    }
  }
  if (Object.getOwnPropertyNames(attrObj).length > 0) {
    result.push(attrObj)
  }
  forEachChild(node, (x) => { result.push(compacted(x)) })
  return result
}

module.exports.children = children
module.exports.forEachChild = forEachChild
module.exports.tagName = tagName
module.exports.attrNames = attrNames
module.exports.attr = attr
module.exports.numChildren = numChildren
module.exports.child = child
module.exports.walk = walk
module.exports.walkAttrValues = walkAttrValues
module.exports.find = find
module.exports.match = match
module.exports.expanded = expanded
module.exports.compacted = compacted

// maybe... internal
module.exports.attrsPresent = attrsPresent
module.exports.rawAttrs = rawAttrs

},{}]},{},[5]);
