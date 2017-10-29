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
