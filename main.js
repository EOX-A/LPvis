'use strict'

/*******************************************************************************
*********************************** LPvis **************************************
********************************************************************************
************************** Land Parcel Visualizer ******************************
********************************************************************************
Visualize land parcels together with classification results
********************************************************************************

# OUTLINE

## UTIL
### PARAMETERS
### CLASS MODIFICATIONS
### FUNCTIONS

## MAP
### INIT MAP
### INIT BASEMAPS
### INIT ADMINISTRATIVE BOUNDARIES
### INIT LPIS LAYERS
### EVENT LISTENERS
### CONTROLS
*****************************/

/****** PARAMETERS ******/

const AGRICULTURAL_PARCELS_URL_TEMPLATE = 'http://localhost:9000/{z}/{x}/{y}.pbf'
const PHYSICAL_BLOCKS_URL_TEMPLATE = 'http://localhost:9001/{z}/{x}/{y}.pbf'
const MUNICIPALITIES_URL_TEMPLATE = 'http://localhost:9002/{z}/{x}/{y}.pbf'

// NUTS_LEVEL and NUTS_CODE_STARTS_WITH only apply to GeoJSONs from Eurostat's Nuts2json
// https://github.com/eurostat/Nuts2json
const NUTS_LEVEL = 2
const NUTS_CODE_STARTS_WITH = 'AT'
const NUTS2_GEOJSON_URL = 'geodata/bounding_box_classification_20190723.geojson' // OR: `https://raw.githubusercontent.com/eurostat/Nuts2json/gh-pages/2016/4258/10M/nutsrg_${NUTS_LEVEL}.json`

const AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER = 'Ori_id'
const PHYSICAL_BLOCKS_UNIQUE_IDENTIFIER = 'RFL_ID'

const ORTHOPHOTO_URL_TEMPLATE = 'https://maps{s}.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg'

const CONFIDENCE_THRESHOLD = 95
const INITIAL_SWIPE_DISTANCE = 0

let legend_control, nuts2, swipe_control, table
let clicked_features = []

const parcel_style = {
  weight: 0.3,
  fill: true,
  fillOpacity: 0.6
}

const parcel_style_highlighted = {
  weight: 0.3,
  color: 'orange',
  fill: true,
  fillOpacity: 1,
}


/****** CLASS MODIFICATIONS ******/

/* Attribution can be lengthy. We don't want it to show always. This class
modification changes the attribution container so that we can hide it until
the user hovers an ℹ-icon. */
L.Control.Attribution.include({

	_update: function () {
		if (!this._map) { return; }

		var attribs = [];

		for (var i in this._attributions) {
			if (this._attributions[i]) {
				attribs.push(i);
			}
		}

		var prefixAndAttribs = [];

		if (this.options.prefix) {
			prefixAndAttribs.push(this.options.prefix);
		}
		if (attribs.length) {
			prefixAndAttribs.push(attribs.join(', '));
		}

    // Source: https://github.com/route360/Leaflet.CondensedAttribution/blob/master/dist/leaflet-control-condended-attribution.js
		this._container.innerHTML = '<div class="attribution-body">' +
                                  prefixAndAttribs.join(' | ') +
                                '</div>\
                                <div class="attribution-icon">ℹ</div>';
	}
})


/* MagnifyingGlass only activates after clicking on control */
//Source: https://github.com/bbecquet/Leaflet.MagnifyingGlass/blob/master/examples/example_button.js
L.Control.MagnifyingGlass = L.Control.extend({
  _magnifyingGlass: false,

  options: {
    position: 'topleft',
    title: 'Toggle Magnifying Glass',
    forceSeparateButton: false
  },

  initialize: function (magnifyingGlass, options) {
    this._magnifyingGlass = magnifyingGlass;
    // Override default options
    for (var i in options) if (options.hasOwnProperty(i) && this.options.hasOwnProperty(i)) this.options[i] = options[i];
  },

  onAdd: function (map) {
    var className = 'leaflet-control-magnifying-glass', container;

    if (map.zoomControl && !this.options.forceSeparateButton) {
      container = map.zoomControl._container;
    } else {
      container = L.DomUtil.create('div', 'leaflet-bar');
    }

    this._createButton(this.options.title, className, container, this._clicked, map, this._magnifyingGlass);
    return container;
  },

  _createButton: function (title, className, container, method, map, magnifyingGlass) {
    var link = L.DomUtil.create('a', className, container);
    link.href = '#';
    link.title = title;

    L.DomEvent
    .addListener(link, 'click', L.DomEvent.stopPropagation)
    .addListener(link, 'click', L.DomEvent.preventDefault)
    .addListener(link, 'click', function() {method(map, magnifyingGlass);}, map);

    return link;
  },

  _clicked: function (map, magnifyingGlass) {
    if (!magnifyingGlass) {
      return;
    }

    if (map.hasLayer(magnifyingGlass)) {
      map.removeLayer(magnifyingGlass);
    } else {
      magnifyingGlass.addTo(map);
    }
  }
});

L.control.magnifyingglass = function (magnifyingGlass, options) {
  return new L.Control.MagnifyingGlass(magnifyingGlass, options);
};


/* Default of the Swipe control is to split the screen 50/50. We want the
physical blocks to be less prominent. Thus we set a different
INITIAL_SWIPE_DISTANCE. */
L.Control.Swipe.include({
  onAdd: function(map) {
    var e = L.DomUtil.create('div', 'leaflet-control-swipe');
    e.style.cursor = "pointer";
    e.style.color = "#0078A8";
    e.style.textAlign = "center";
    e.style.textShadow = "0 -1px #fff, 0 1px #000";
    e.style.margin = `-24px 0px 0px calc(-${INITIAL_SWIPE_DISTANCE*100}% - 48px)`;
    e.style.top = '50%'
    e.style.left = INITIAL_SWIPE_DISTANCE*100 + '%'
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
    var s = map.getSwipePaneSize();
    L.DomUtil.setPosition(this._container, L.point(s.x, 0));
  }

})

/* By default the button only reads "Tables". We make this more verbose:
"Open/Close Table" */
L.control.Table.include({
  initialize: function(){
    var that = this;

    var control = L.DomUtil.create('div','leaflet-control leaflet-table-container');
    var inner = L.DomUtil.create('div');

    var tables = L.DomUtil.create('div','leaflet-tables-container');
    this.tables = tables;

    var switcher = L.DomUtil.create('select','leaflet-table-select');
    switcher.addEventListener('change',function(evt){
      var curr = evt.target[evt.target.selectedIndex].value;
      for(var rel in that.containers) {
        var container = that.containers[rel];
        if(rel==curr && container.style.display != 'block') {
          container.style.display='block';
        } else {
          container.style.display='none';
        }
      }
    },false);
    this.switcher=switcher;

    var option = L.DomUtil.create('option');
    option.value='none';
    option.innerHTML='Open/Close Table';
    switcher.appendChild(option);

    control.appendChild(inner);
    inner.appendChild(switcher);
    inner.appendChild(tables);

    control.onmousedown = control.ondblclick = L.DomEvent.stopPropagation;

    this.control=control;
  }
})


L.MagnifyingGlass.include({
  setFixedZoom: function(fixedZoom) {
    this._fixedZoom = (fixedZoom != -1);
    this.options.fixedZoom = fixedZoom;
    this._updateZoom()
  },

  setRadius: function(radius) {
    this.options.radius = radius;
    if(this._wrapperElt) {
      this._wrapperElt.style.width = this.options.radius * 2 + 'px';
      this._wrapperElt.style.height = this.options.radius * 2 + 'px';
      this._glassMap.invalidateSize()
    }
  },
})


/****** FUNCTIONS ******/

function fetchJSON(url) {
  return fetch(url)
    .then(function(response) {
      return response.json();
    });
}

function clearClickedFeatures() {
  for(let id of clicked_features) agricultural_parcels.resetFeatureStyle(id)
  clicked_features = []
}

function exportTableToCSV() {
  const table_rows = document.querySelector('div.body > table > tbody').children
  const csv = []
  const a = document.createElement('a') // create link, don't add it to DOM
  const event = document.createEvent('MouseEvents')
  event.initEvent('click', true, true)

  csv.push(Object.keys(table_rows[0].dataset).join(','))
  for(let tr of table_rows) {
    csv.push(Object.values(tr.dataset).join(','))
  }

  a.setAttribute('download', 'data.csv')
  a.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv.join('\r\n')))
  a.dispatchEvent(event); // click link to trigger download
}

function initSwipeControl() {
  swipe_control = L.control.swipe().addTo(map)
  const swipe_container = swipe_control.getContainer()
  swipe_container.onclick = e => e.stopPropagation()

  // Properly resize swipe pane and remove it from controls DOM container
  const map_container = map.getContainer()
  map.getPane('swipePane').style.zIndex = 451 // above labels to improve visibility of physical_blocks boundaries
  map.setSwipePaneSize(map.getSize().scaleBy(L.point(INITIAL_SWIPE_DISTANCE, 1)));
  map_container.insertBefore(swipe_container, map_container.firstChild) // We don't want it to take up space in the controls DOM container

  // Open tooltip on map to explain Swipe control
  const c = swipe_container.getBoundingClientRect()
  const tooltip_coords = map.containerPointToLatLng([c.x+c.width*.9,c.y+c.height/2*1.2])
  map.openTooltip('Pull right to overlay physical blocks.', tooltip_coords)

  // Prevent tooltip from staying too long
  map.once('mousedown zoomstart layerremove', removeTooltipsFromMap)
}

function initTable(attribute_labels) {
  if(L.Browser.mobile) return; // disable on mobile browsers

  const table_control = new L. control.Table({}).addTo(map)
  const table_container = table_control.getContainer().children[0] // leaflet.table.js|49 creates unnecessary (?) <div>
  const button = document.createElement('button')

  table = new Supagrid({
    fields: attribute_labels,
    id_field: AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER,
    data: {} // to be filled later on click
  })

  table_control.addTable(table.supagrid, 'agricultural_parcels', 'Agricultural parcels')
  table_control.getContainer().onclick = e => e.stopPropagation() // to prevent click events on map, which clear table

  button.style.display = 'none'
  button.style.float = 'right'
  button.innerHTML = 'Export (CSV)'
  button.onclick = exportTableToCSV

  table_container.insertBefore(button, table_container.lastChild)
  table_container.querySelector('select').addEventListener('change', e => {
    if(e.target.selectedOptions[0].value === 'none') {
      button.style.display = 'none'
    } else {
      button.style.display = 'block'
    }
  })
}

function removeTooltipsFromMap() {
  // source: https://gis.stackexchange.com/questions/254276/how-to-close-all-tooltips-defined-against-the-map-object
  map.eachLayer(function(layer) {
    if(layer.options.pane === "tooltipPane") layer.removeFrom(map);
  })
}

function trafficLightStyle (properties, is_highlighted) {
  if (properties.accuracy < CONFIDENCE_THRESHOLD) return {
    fillColor: 'yellow',
    color: 'yellow',
    ...(is_highlighted ? parcel_style_highlighted : parcel_style)
  }
  else if (properties.match === 'True') return {
    fillColor: 'green',
    color: 'green',
    ...(is_highlighted ? parcel_style_highlighted : parcel_style),
  }
  else if (properties.match === 'False') return {
    fillColor: 'red',
    color: 'red',
    ...(is_highlighted ? parcel_style_highlighted : parcel_style)
  }
  else return {
    fillColor: 'grey',
    color: 'grey',
    ...(is_highlighted ? parcel_style_highlighted : parcel_style)
  }
}


/****** INIT MAP ******/

const map = L.map('map').setView([50.102223, 9.254419], 4)
map.createPane('administrative').style.zIndex = 250
map.createPane('labels').style.zIndex = 450


/****** INIT BASEMAPS ******/

const cloudless2018 = L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2018_3857/default/g/{z}/{y}/{x}.jpg', {
  interactive: false,
  attribution: '<a xmlns:dct="http://purl.org/dc/terms/" href="https://s2maps.eu" \
                property="dct:title">Sentinel-2 cloudless - https://s2maps.eu</a>\
                by\
                <a xmlns:cc="http://creativecommons.org/ns#" href="https://eox.at" \
                property="cc:attributionName" rel="cc:attributionURL">EOX IT Services GmbH</a> \
                (Contains modified Copernicus Sentinel data 2017 & 2018)'
})

const terrain_light = L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/terrain-light_3857/default/g/{z}/{y}/{x}.jpg', {
  interactive: false,
  attribution: 'Terrain Light { Data © \
                <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> \
                contributors and <a href="https://maps.eox.at/#data">others</a>, \
                Rendering © <a href="http://eox.at">EOX</a> }'
}).addTo(map)

const overlay = L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/overlay_3857/default/g/{z}/{y}/{x}.png', {
  interactive: false,
  format: 'image/png',
  transparent: true,
  pane: 'labels',
  attribution: 'Overlay { Data © \
                <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> \
                contributors, Rendering © \
                <a href="http://eox.at">EOX</a> and <a href="https://github.com/mapserver/basemaps">MapServer</a>}'
}).addTo(map)

const orthophoto = L.tileLayer(ORTHOPHOTO_URL_TEMPLATE, {
  interactive: false,
  maxZoom: 20,
  subdomains: ['','1','2','3','4'],
  attribution: 'Orthophoto: <a href="basemap.at">basemap.at</a>'
})

const osm = L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/osm_3857/default/g/{z}/{y}/{x}.jpg', {
  interactive: false,
  attribution: 'OpenStreetMap { Data © \
                <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> \
                contributors, Rendering © \
                <a href="https://github.com/mapserver/basemaps">MapServer</a> \
                and <a href="http://eox.at">EOX</a> }'
})


/****** INIT ADMINISTRATIVE BOUNDARIES ******/

fetchJSON(NUTS2_GEOJSON_URL).then(data => {
  nuts2 = L.geoJSON(data, {
    interactive: false,
    pane: 'administrative',
    filter: feature => {
      if (feature.properties.id) {
        return feature.properties.id.startsWith(NUTS_CODE_STARTS_WITH)
      } else {
        return true
      }
    },
    style: feature => { return {
      fill: true,
      fillColor: '#cc6633',
      fillOpacity: 0.6,
      stroke: true,
      color: '#cc6633',
      weight: 2
    }},
    attribution: 'NUTS2 { CC-BY-3.0 <a href="data.statistik.gv.at">Statistik Austria</a> }'
  }).addTo(map)
  map.flyToBounds(nuts2.getBounds(), { duration: 2 })
})

const municipalities = L.vectorGrid.protobuf(MUNICIPALITIES_URL_TEMPLATE, {
  interactive: false,
  maxNativeZoom: 14,
  minZoom: 11,
  pane: 'administrative',
  vectorTileLayerStyles: {
    gem_at: {
      stroke: true,
      color: '#cc6633',
      weight: 1
    }
  },
  attribution: 'Gemeinden { CC-BY-3.0 <a href="data.statistik.gv.at">Statistik Austria</a> }'
}).addTo(map)


/****** INIT LPIS LAYERS ******/
/* Instead of Leaflet.VectorGrid we could use Leaflet.VectorTileLayer by Joachim Kuebart
https://gitlab.com/jkuebart/Leaflet.VectorTileLayer/
We then would not have to declare layer names in the style (useful for
interoperability with other sources -> we don't have to know layer names in advance)
Also svg styles in high zoom levels would not seem bloated because stroke weight
does not get overscaled */

const physical_blocks = L.vectorGrid.protobuf(PHYSICAL_BLOCKS_URL_TEMPLATE, {
  rendererFactory: L.svg.tile, // canvas ist pixelated and has tooltip artifacts
  pane: 'swipePane',
  interactive: true,
  minNativeZoom: 11,
  maxNativeZoom: 15,
  minZoom: 14,
  vectorTileLayerStyles: {
    invekos_referenzen_vector_tiles: properties => {
      return {
        fill: true,
        fillColor: '#ffffff',
        fillOpacity: 0.7,
        color: '#000000',
        weight: 1.5
      }
    }
  },
  getFeatureId: feature => feature.properties[PHYSICAL_BLOCKS_UNIQUE_IDENTIFIER],
  attribution: 'INVEKOS Referenzflächen Österreich { CC-BY-3.0-AT Agrarmarkt Austria }'
}).bindTooltip('', { sticky: true }).addTo(map)

const agricultural_parcels = L.vectorGrid.protobuf(AGRICULTURAL_PARCELS_URL_TEMPLATE, {
  rendererFactory: L.svg.tile,
  interactive: true,
  // minZoom must not be <= minNativeZoom otherwise library requests millions of tiles
  // Leaflet bug: https://github.com/Leaflet/Leaflet/issues/6504
  // minNativeZoom: 14,
  maxNativeZoom: 16,
  minZoom: 14,
  vectorTileLayerStyles: {
    agricultural_parcels: properties => {
      if(!table) {
        initTable(Object.keys(properties))
      }

      return trafficLightStyle(properties,false)
    }
  },
  getFeatureId: feature => feature.properties[AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER],
  attribution: 'INVEKOS Schläge Österreich { CC-BY-3.0-AT Agrarmarkt Austria }'
}).bindTooltip('', { sticky: true }).addTo(map)


/****** EVENT LISTENERS ******/

agricultural_parcels.on('mouseover', e => {
  const attributes = e.propagatedFrom.properties
  agricultural_parcels.setTooltipContent(
    `ID: ${attributes[AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER]}<br>
    Declaration: ${attributes['CT']}<br>
    Conform: ${attributes.match === 'True' ? 'yes'
             : attributes.match === 'False' ? 'no'
             : 'not classified'}<br>
    Confidence level: ${attributes.accuracy}${attributes.accuracy ? '%' : ''}`,
    { sticky:true })
})

agricultural_parcels.on('click', e => {
  L.DomEvent.stopPropagation(e)
  const attributes = e.propagatedFrom.properties
  console.log(attributes)

  if(!clicked_features.includes(attributes[AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER])) {
    if (L.Browser.mobile) clearClickedFeatures() // so that only one parcel is highlighted at a time
    if (table) table.addLine(attributes)
    clicked_features.push(attributes[AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER])

    agricultural_parcels.setFeatureStyle(attributes[AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER], trafficLightStyle(attributes,true))
  }
})

physical_blocks.on('mouseover', e => {
  const attributes = e.propagatedFrom.properties
  physical_blocks.setTooltipContent(
    `ID: ${attributes[PHYSICAL_BLOCKS_UNIQUE_IDENTIFIER]}<br>
    Type: ${attributes['REF_ART']}`
  )
})

map.on('click', e => {
  if(clicked_features.length > 0) {
    clearClickedFeatures()

    const tbody = document.querySelector('div.body > table > tbody')
    while(tbody && tbody.lastChild) {
      tbody.removeChild(tbody.lastChild)
    }

  }
})

map.on('zoomend', e => {
  console.log('Zoomlevel: ' + map.getZoom())
  if (map.getZoom() >= 11) {
    nuts2.setStyle(feature => { return {
      fill: false
    }})
  }

  if (map.getZoom() < 11) {
    nuts2.setStyle(feature => { return {
      fill: true
    }})
  }

  if (map.getZoom() >= 13) {
    nuts2.setStyle(feature => { return {
      stroke: false
    }})
  }

  if (map.getZoom() < 13) {
    nuts2.setStyle(feature => { return {
      stroke: true
    }})
  }

  if (swipe_control && map.getZoom() < 14) {
    map.removeControl(swipe_control)
    swipe_control = null
  }

  if (!swipe_control && map.getZoom() >= 14 && map.hasLayer(agricultural_parcels) && map.hasLayer(physical_blocks)) {
    initSwipeControl()
  }

  if (map.getZoom() >= 14 && map.hasLayer(agricultural_parcels)) {
    map.addControl(legend_control)
  }

  if (map.getZoom() < 14) {
    map.removeControl(legend_control)
    removeTooltipsFromMap()
  }
})

map.on('layeradd', e => {
  if(!swipe_control && map.getZoom() >= 14 && map.hasLayer(agricultural_parcels) && map.hasLayer(physical_blocks)) {
    initSwipeControl()
  }

  if(map.getZoom() >= 14 && map.hasLayer(agricultural_parcels) && legend_control) {
    map.addControl(legend_control)
  }
})

map.on('layerremove', e => {
  if(swipe_control && !(map.hasLayer(agricultural_parcels) && map.hasLayer(physical_blocks))) {
    map.removeControl(swipe_control)
    map.setSwipePaneSize(map.getSize())
    swipe_control = null
  }

  if(!map.hasLayer(agricultural_parcels)) {
    map.removeControl(legend_control)
  }
})


/****** CONTROLS ******/

var baselayers = {
   "Terrain Light background layer": terrain_light,
   "Sentinel-2 cloudless layer for 2018": cloudless2018
};

var overlays = {
  "Physical blocks": physical_blocks,
  "Agricultural parcels": agricultural_parcels,
  "Overlay": overlay
}

L.control.layers(baselayers, overlays).addTo(map)


legend_control = L.control.custom({
  position: 'topright',
  classes: 'legend',
  content: (function() {
    let legend_content = ''
    const high_confidence_string = `High Confidence (≥${CONFIDENCE_THRESHOLD}%)`
    const legend_definition = {
      'green':  ['Conform', high_confidence_string],
      'yellow': [`Low Confidence (<${CONFIDENCE_THRESHOLD}%)`],
      'red':    ['Not conform', high_confidence_string]
    }

    for(let colour of Object.keys(legend_definition)) {
      legend_content +=
        `<div class="legend-row">
          <div class="legend-colour" style="background-color: ${colour}"></div>
          <div class="legend-description">${legend_definition[colour].join('<br>')}</div>
        </div>`
    }
    return legend_content
  })()
})


const minimap = L.control.minimap(osm, { //layer must be one that is not present on map yet
  toggleDisplay: true,
  minimized: L.Browser.mobile // true if mobile browser
}).addTo(map)
minimap._miniMap.invalidateSize() // otherwise minimap is going crazy
map.attributionControl.addAttribution(osm.getAttribution())

const magnifying_glass = L.magnifyingGlass({
    layers: [orthophoto],
    radius: 140,
    zoomOffset: 0,
    attribution: orthophoto.getAttribution()
}).on('add', e => {
  const glass_map = e.sourceTarget.getMap()
  glass_map.setMaxZoom(20)
  L.DomEvent.on(glass_map.getContainer(), 'mousewheel', e => {
    if (map.getZoom() === 18 && e.deltaY < 0) { // zoom in
      magnifying_glass.setFixedZoom(19)
      magnifying_glass.setRadius(280)
    }
    if (magnifying_glass.options.fixedZoom !== -1 && e.deltaY > 0) { // zoom out
      L.DomEvent.stopPropagation(e) // avoid zoom out of main map
      magnifying_glass.setFixedZoom(-1)
      magnifying_glass.setRadius(140)
    }
  })
})

L.control.magnifyingglass(magnifying_glass, {
    forceSeparateButton: true
}).addTo(map)

L.control.scale( {
  imperial: false,
  maxWidth: 200
} ).addTo(map)
