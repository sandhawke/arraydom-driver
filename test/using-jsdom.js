'use strict'

const test = require('tape')
const domdriver = require('../domdriver')
const jsdom = require("jsdom").jsdom

test('simple example from jsdom docs', t => {
  t.plan(1)
  const document = jsdom("hello world");
  const window = document.defaultView;
  const html = window.document.documentElement.outerHTML
  t.equal(html,
          '<html><head></head><body>hello world</body></html>')
})

test('manipulate the dom from outside document', t => {
  t.plan(1)
  const document = jsdom("hello world");
  const window = document.defaultView;

  const e = document.createElement('i')
  document.body.appendChild(e)

  const body = document.body.innerHTML
  t.equal(body,
          'hello world<i></i>')
})


/*

test(t => {
  t.plan(1)
  let tree = [add, 1, 2]
  t.equal(domdriver.evalFunctions(tree), 3)
})

test(t => {
  t.plan(1)
  let t0  = ['div', {a: 1}, 'hello', [add, 1, 2], 'bye']
  let t1  = ['div', {a: 1}, 'hello', 3, 'bye']
  t.deepEqual(domdriver.evalFunctions(t0), t1)
})

test(t => {
  t.plan(1)
  let t0  = ['div', {a: 1}, 'hello', ['b', [add, 1, 2]], 'bye']
  let t1  = ['div', {a: 1}, 'hello', ['b', 3] , 'bye']
  t.deepEqual(domdriver.evalFunctions(t0), t1)
})

test(t => {
  t.plan(1)
  t.deepEqual(b(1,2,3,4), ['b', 1, 2, 3, 4])
})

test(t => {
  t.plan(1)
  let t0  = ['div', {a: 1}, 'hello', [b, 'result is', [add, 1, 2]], 'bye']
  let t1  = ['div', {a: 1}, 'hello', ['b', 'result is', 3] , 'bye']
  t.deepEqual(domdriver.evalFunctions(t0), t1)
})

function add (a, b) {
  return a + b
}

function b (...args) {
  const result = ['b']
  Array.prototype.push.apply(result, args)
  return result
}

*/
