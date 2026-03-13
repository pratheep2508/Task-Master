const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('app.js', 'utf8');

const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });

dom.window.addEventListener('error', event => {
    console.error('JSDOM Uncaught Error:', event.error);
});

const script = dom.window.document.createElement('script');
script.textContent = js;
dom.window.document.body.appendChild(script);

// Trigger DOMContentLoaded
dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
