
var Supagrid = function(options){

  var grid = this;

  grid.fields=options.fields;
  grid.data=options.data;
  grid.element=options.element;
  grid.id_field=options.id_field;
  grid.on=options.on;

  grid.addLine = function(obj){
    var tr=document.createElement('tr');
    for(var f=0;f<grid.fields.length;f++) {
      var td = document.createElement('td');
      td.dataset.field=grid.fields[f];
      var input = document.createElement('input');
      input.name=grid.fields[f];
      if(typeof obj[grid.fields[f]] == 'undefined') {
        input.value='';
        td.dataset.value="";
      } else {
        input.value=obj[grid.fields[f]];
        td.dataset.value=obj[grid.fields[f]];
      }
      input.onchange=function(){
        obj[this.name]=this.value;
      };
      input.dataset.id=obj[grid.id_field];
      td.appendChild(input);
      tr.appendChild(td);
      tr.dataset[grid.fields[f]] = obj[grid.fields[f]];

      input.addEventListener("keydown",function(evt){
        var c = evt.keyCode;
        var k = evt.key;
        if(c == 13 || c == 40 || k == 'Enter' || k == 'Down')  {
          var me = tr.parentNode;
          var next = tr.nextSibling;
          if(next) {
            var next_input = next.querySelector('input[name="'+evt.target.name+'"]');
            setTimeout(function(){
              next_input.focus();
            },200);
          }
        } else if(c == 38 || k == 'Up') {
          setTimeout(function(){
          var me = tr.parentNode;
          var previous = tr.previousSibling;
          if(previous) {
            var previous_input = previous.querySelector('input[name="'+evt.target.name+'"]');
            setTimeout(function(){
              previous_input.focus();
            },200);
          }
          },200);
        }
      });

      input.addEventListener('focus',function(evt){
          grid.focus(evt.target.dataset.id,true);
          if(typeof grid.on == 'object' && typeof grid.on.focus == 'function') {
            grid.on.focus(evt.target.dataset.id);
          }
      });
    }
    tbody.appendChild(tr);
    if(typeof Object.observe == 'function') {
      Object.observe(obj,function(changes){
        for(var i=0;i<changes.length;i++){
          var value = changes[i].object[changes[i].name];
          var input=tr.querySelector('td[data-field="'+changes[i].name+'"] input');
          if(input.value != value) {
            input.value=value;
          }
        }
      });
    }
  };

  grid.filter = function() {
    var filters=[];
    var inputs = supagrid.querySelectorAll('thead input');
    for(var i=0;i<inputs.length;i++) {
      if(inputs[i].value.length >= 1) {
        filters.push([inputs[i].name,inputs[i].value]);
      }
    }

    var trs = table.querySelectorAll('tbody>tr');
    for(var i=0;i<trs.length;i++) {
      var ok =true;

      var tds=trs[i].querySelectorAll('td');
      for(var t=0;t<tds.length;t++) {
        var td_f=tds[t].dataset.field;
        var td_v=tds[t].dataset.value;

        for(var f=0;f<filters.length;f++) {
          if(td_f==filters[f][0]) {
            if(td_v.indexOf(filters[f][1]) < 0) {
              ok=false;
            }
          }
        }
      }
      if(ok) {
        trs[i].style.display='table-row';
      } else {
        trs[i].style.display='none';
      }
    }
  };

  grid.focus = function(id,light) {
    var prev=body.querySelector('.focus');
    if(prev != null) prev.classList.remove('focus');
    var sel = 'tr[data-'+grid.id_field+'="'+id+'"]';
    var curr=grid.supagrid.querySelector(sel);
    if(curr != null) {
      curr.classList.add('focus'); 
      if(typeof light == 'undefined' || !light) curr.querySelector('input').focus();
    }
  };

  var supagrid = document.createElement('div');
  supagrid.classList.add('x-supagrid');

  var container = document.createElement('div');
  container.classList.add('container');

  var table_for_head = document.createElement('table');
  table_for_head.classList.add('head');
  var thead = document.createElement('thead');
  var thead_row = document.createElement('tr');
  for(var i=0;i<grid.fields.length;i++) {
    var th = document.createElement('th');
    var title = document.createElement('span');
    title.textContent=grid.fields[i];
    var input = document.createElement('input');
    input.name=grid.fields[i];
    input.onchange=grid.filter;
    th.appendChild(title);
    th.appendChild(input);
    thead_row.appendChild(th);
  }
  thead.appendChild(thead_row);
  table_for_head.appendChild(thead);
  container.appendChild(table_for_head);

  var body = document.createElement('div');
  body.classList.add('body');
  var table = document.createElement('table');
  var tbody = document.createElement('tbody');
  for(var i=0;i<grid.data.length;i++) {
    grid.addLine(grid.data[i]);
  }
  table.appendChild(tbody);
  body.appendChild(table);
  container.appendChild(body);
  supagrid.appendChild(container);

  grid.supagrid = supagrid;

  if(typeof grid.element != 'undefined') {
    grid.element.appendChild(supagrid);
  }

  if(typeof Array.observe == 'function') {
    Array.observe(grid.data,function(change){
      // TODO: array observe to add and remove lines;
    });
  }

  return grid;
};

