'use strict'

const diff = require('arraydom-diff')

function scalar (x) {
  return (typeof x === 'string' || typeof x === 'number')
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
      const evaldTree = evalFunctions(tree, touch)
      // console.log('evaldTree is', evaldTree)
      const delta = diff.diff(treeCopy, evaldTree)
      // console.log('delta is', delta)
      treeCopy = evaldTree
      diff.patch(elem, delta, document)
      touched = false
    }
    schedule(paint)
  }

  /*
  function live (db, func, attrs ) {
    const t = ['div', attrs]
    function change (newValue) {
      t.splice(2)
      const out = func(newValue, attrs)
      if (out) {
        t.push(out)
        // console.log('t = ', JSON.stringify(t))
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
        if (typeof arg.on === 'function') {
          arg.on('change', onChange)
        }
        if (typeof arg.onchange === 'function') {
          arg.onchange(onChange)
        }
      }
      const output = a[0].apply(null, args)
      // console.log('func returned', output)
      return evalFunctions(output, onChange)
    } else {
      const result = []
      for (let aa of a) {
        result.push(evalFunctions(aa, onChange))
      }
      return result
    }
  }
  if (typeof (a) === 'object') {
    return Object.assign({}, a)
  }
  console.error('unexpected object', a)
  throw Error('no other types implemented')
}

// for testing
module.exports.evalFunctions = evalFunctions

// for real
module.exports.create = create
