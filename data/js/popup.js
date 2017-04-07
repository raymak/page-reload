let disabled = false
let days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
let months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

let breakageChecked = null

function show (querySelector) {
  for (let element of document.querySelectorAll(querySelector)) {
    element.classList.remove('hide')
  }
}

function hide (querySelector) {
  for (let element of document.querySelectorAll(querySelector)) {
    element.classList.add('hide')
  }
}

// http://stackoverflow.com/questions/6121203/how-to-do-fade-in-and-fade-out-with-javascript-and-css

function fadeOut(querySelector, duration){
  let element = document.querySelector(querySelector);

  let op = 1;  // initial opacity
 
  let timer = setInterval(function () {
      if (op <= 0.1){
          clearInterval(timer);
          hide(querySelector);
      }
      element.style.opacity = op;
      element.style.filter = 'alpha(opacity=' + op * 100 + ")";
      op -= 0.1;
  }, duration/10);
}

function fadeIn(querySelector, duration){
  let element = document.querySelector(querySelector);

  let op = 0.1;  // initial opacity
  element.style.opacity = op;
  show(querySelector);
    
  let timer = setInterval(function () {
      if (op >= 1){
          clearInterval(timer);
      }
      element.style.opacity = op;
      element.style.filter = 'alpha(opacity=' + op * 100 + ")";
      op += 0.1;
  }, duration/10);
}

function fadeInThanks(){
  fadeOut('#main-panel', 200);
  fadeIn('#thanks-panel', 500);

}

function showThanks(){
  hide('#main-panel');
  show('#thanks-panel');
}

// click listener on the choices
for (let choice of document.querySelectorAll('.choice-pair')){
  choice.addEventListener('click', e => {
    let target = e.currentTarget;
    let checkbox = target.querySelector('input[type=checkbox]');
    checkbox.checked = true;
    let reaction = checkbox.dataset.reaction;
    self.port.emit('reaction', reaction);
    fadeInThanks();
    setTimeout(()=> self.port.emit('close'), 1000);
    ;
  });
}

// listener for learn more
document.querySelector('.btn.more').addEventListener('click', ()=>{self.port.emit('more')});