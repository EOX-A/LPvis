(function(window) {

  L.Control.Swipe = L.Control.extend({
    options: {
      position: 'bottomleft'
    },
    _onDrag: function() {
      var x = L.DomUtil.getPosition(this._container).x;
      var size = this._map.getSize();
      size.x = Math.max(0, Math.min(size.x, x));
      this._map.setSwipePaneSize(size);
    },
    onAdd: function(map) {
      var e = L.DomUtil.create('div', 'leaflet-control-swipe');
      e.style.cursor = "pointer";
      e.style.color = "#0078A8";
      e.style.textAlign = "center";
      e.style.textShadow = "0 -1px #fff, 0 1px #000";
      e.style.marginLeft = "-1em";
      e.style.width = "2em";
      e.style.fontSize = "48px";
      e.style.lineHeight = "48px";
      e.innerHTML = "\u25C0\u25B6";
      this._container = e;
      (new L.Draggable(e)).on("drag", this._onDrag, this).enable();
      map.on("swipePaneUpdate", this._update, this);
      this._update();
      return this._container;
    },
    _update: function() {
      var s = this._map.getSwipePaneSize();
      L.DomUtil.setPosition(this._container, L.point(s.x, 0));
    }
  });

  L.Map.addInitHook(function() {
    var e = this.createPane("swipePane");
    e.style.zIndex = 201;
    e.style.overflow = "hidden";
    this.setSwipePaneSize(this.getSize().scaleBy(L.point(0.5, 1)));
    this.on("move", function() {
      var push = this.containerPointToLayerPoint(L.point(0, 0));
      var pull = push.multiplyBy(-1);
      L.DomUtil.setPosition(e, push);
      for (var f = e.firstChild; f; f = f.nextSibling)
        L.DomUtil.setPosition(f, pull);
    }, this);
    this.on("resize", function(event) {
      var size = this.getSwipePaneSize();
      size = size.scaleBy(event.newSize);
      size = size.unscaleBy(event.oldSize);
      this.setSwipePaneSize(size);
    }, this);
  });

  L.Map.include({
    setSwipePaneSize: function(size) {
      var e = this.getPane("swipePane");
      e.style.width = size.x + "px";
      e.style.height = size.y + "px";
      this.fire("swipePaneUpdate");
    },
    getSwipePaneSize: function() {
      var e = this.getPane("swipePane");
      return L.point(
        parseFloat(e.style.width.replace("px", "")),
        parseFloat(e.style.height.replace("px", ""))
      );
    }
  });

  L.control.swipe = function(options) {
    return new L.Control.Swipe(options);
  };
})(window);
