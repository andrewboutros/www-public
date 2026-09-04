(function(){
  var stage = document.getElementById('stage');
  var controls = Array.prototype.slice.call(document.querySelectorAll('.fabric-control'));
  var inst = null;

  function opts(){
    var values = {};
    controls.forEach(function(control){
      values[control.dataset.option] = +control.value / +(control.dataset.divisor || 1);
    });
    return values;
  }
  function label(){
    controls.forEach(function(control){
      var divisor = +(control.dataset.divisor || 1);
      var digits = +(control.dataset.digits || 0);
      var value = (+control.value / divisor).toFixed(digits);
      document.getElementById(control.id + '-v').textContent = (control.dataset.prefix || '') + value;
    });
  }
  function remount(){
    label();
    if(!window.Fabric){ return; }
    if(inst) inst.destroy();
    inst = window.Fabric.mount(stage, opts());
  }
  controls.forEach(function(control){
    control.addEventListener('input', remount);
  });
  document.getElementById('reroll').addEventListener('click', remount);
  remount();
})();
