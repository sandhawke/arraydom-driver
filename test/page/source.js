'use strict'

const domdriver = require('../../domdriver')

// used for in the niceDB example
const EventEmitter = require('eventemitter3')

// This is a changing data source which emits change events
const niceDB = (() => {
  const db = new EventEmitter()
  db.message = 'starting'
  
  let n = 0
  setInterval( () => {
    db.message = '' + (new Date()) + '  counter=' + n++
    db.emit('change')
  }, 1)
  return db
})()

// This is a changing data source which does nothing helpful
const otherDB = (() => {
  const db = {}
  db.message = 'starting'
  
  let n = 0
  setInterval( () => {
    db.message = '' + (new Date()) + '  counter=' + n++
  }, 1)
  return db
})()

// When the data source emits changes, this is all you need
domdriver.create('e1', [func, {$fontWeight: 'bold'}, niceDB] )

// handle otherDB with polling
domdriver.create('e2', [func, {$fontWeight: 'bold'}, otherDB], { poll: 1} )

// handle otherDB by calling touch ourselves
const dd3 = domdriver.create('e3', [func, {$fontWeight: 'bold'}, otherDB] )
setInterval( () => {
  dd3.touch()
}, 1)

const x = domdriver.watchable({ message: 'starting' })
const dd4 = domdriver.create('e4', [func, {$fontWeight: 'bold'}, x])
{
  let n = 0
  setInterval( () => {
    x.message = '' + (new Date()) + '  counter=' + n++
  }, 1)
}

// Turn the give data source into some simple HTML
function func (attrs, data) {
  return [b, attrs, data.message]
}

// Just showing off how a function can return a function.  In this
// case we've made a function called 'b' which wraps its arguments in
// an HTML 'b' element.  Basically, lets you say [b, ...] instead of
// ['b', ...].   Silly, of course.
function b (...args) {
  const result = ['b']
  Array.prototype.push.apply(result, args)
  return result
}

// Show event handling
(function b1 () {
  const tree = ['p', {}, ['button', { onclick: click}, 'Click Me']]
  const dd = domdriver.create('b1', tree)
  function click () {
    tree.push(' Clicked! ')
    dd.touch()
  }
})();


(() => {
  const tree = ['p', {}, ['button', { onclick: click}, '1-second-poll Click Me']]
  const dd = domdriver.create('b2', tree, { poll: 1000} )
  function click () {
    tree.push(' Clicked! ')
  }
})();

(() => {
  const tree = ['p', {}, ['input', { onchange: change,
                                     oninput: input,
                                     placeholder: 'type here!'}]]
  const dd = domdriver.create('b3', tree)
  function input (ev) {
    tree.splice(3)
    tree[3] = ' text: ' + JSON.stringify(ev.target.value)
    dd.touch()
  }
  function change (ev) {
    tree.push(' (got change event) ')
    dd.touch()
  }
})();
