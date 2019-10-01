'use strict'

/****** PARAMETERS ******/

const NO_TIMESTACK_FOUND_STRING = 'No timestack available for this parcel'

const METADATA_COLS = ["Week", "Date", "Sensor", "Cloud Cover", "Haze", "Cloud shadow"]
const FLAG_COLS = METADATA_COLS.slice(3)

// FIS API: https://creodias.eu/statistical-info-service
const FIS_URL = 'https://services.sentinel-hub.com/ogc/fis/{INSTANCE_ID}'
const FIS_HEADERS = new Headers({ 'Accept': 'application/json',
                                  'Content-Type': 'application/json' })

const buildRequest = function(wkt) {
  return new Request(FIS_URL, {
    method: 'POST',
    headers: FIS_HEADERS,
    body: '{"layer":"NDVI","crs":"CRS:84","time":"2017-11-01/2018-10-31","resolution":"10m",' +
           `"geometry":"${wkt}",` +
           '"bins":10,"type":"EQUALFREQUENCY","maxcc":10}'
  })
}


// D3
const dateFormat = d3.timeFormat('%d.%m.') // e.g. 12.3.
const formatDecimals = d3.format('.3f') // three decimals
const bisectDate = d3.bisector(d=>d.date).left

const area = d3.area()
  .x(d => x(d.date))
  .y0(d => y(d.min)) //baseline
  .y1(d => y(d.max)) //topline
  .defined(d => d.mean !== 'NaN')

const line = d3.line()
  .x(d => x(d.date))
  .y(d => y(d.mean))
  .defined(d => d.mean !== 'NaN')

const t = d3.transition()
  .duration(1250)
  .ease(d3.easeCubicOut);

// Variable declaration without initialization
let sidebar, // DOM
    csvurl, // file
    chart, graphic, // SVG
    x, y, xAxis, yAxis, // D3
    tooltip, tooltip_scale,
    thead_tr, tbody, metadata_list // metadata

// Don't fill sidebar before DOMContentLoaded
window.addEventListener('DOMContentLoaded', e => {
    sidebar = document.querySelector('#sidebar')
});


/****** FUNCTIONS ******/

function showSidebar() {
  sidebar.style.display = 'flex'
  map.invalidateSize()
  if(!sidebar.hasChildNodes()) setUpSidebar()
}

function hideSidebar() {
  sidebar.style.display = 'none'
  map.invalidateSize()
}

function setUpSidebar() {
  // SVG CHART
  console.log(sidebar.offsetWidth, sidebar.clientWidth)
  let margin = {top: 20, right: 20, bottom: 20, left: 40},
      width  = sidebar.offsetWidth - margin.left - margin.right,
      height = 300 - margin.top - margin.bottom
      // scrollbar_offset = 20

  x = d3.scaleTime()
        .range([0, width]),
  y = d3.scaleLinear()
        .range([height, 0])
        .domain([0,1])
  tooltip_scale = d3.scaleLinear()
        .range([margin.left,sidebar.offsetWidth-130]) // 130 ~ width of tooltip
        .domain([5,width]) // 5 = padding

  const svg = d3.select("#sidebar").append('svg')
    .attr('id', 'timeseries-graph')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)

  chart = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  xAxis = chart.append('g')
    .attr('stroke','#ffffff')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)))

  yAxis = chart.append('g')
    .attr('stroke','#ffffff')
    .call(d3.axisLeft(y))

  graphic = chart.append('g')

  chart.append('line').classed('tooltip-line', true)
    .attr('id', 'tooltip-line')
    .attr('y2', y(0))

  tooltip = d3.select("#sidebar").append('div')
    .classed('tooltip', true)


  // // METADATA AND DATA TABLE
  // const details = d3.select('#sidebar').append('details')
  // details.append('summary').text('Metadata and digital numbers')
  // metadata_list = details.append('ul')
  //
  // const table = details.append('table')
  //   .attr('id', 'points-table')
  // thead_tr = table.append('thead').append('tr')
  // tbody = table.append('tbody')

  // DOWNLOAD BUTTON
  d3.select('#sidebar').append('a')
    .classed('btn download-btn', true)
    .attr('id', 'download-button')
    .html('<i class="fas fa-download"></i> Download Timestack (CSV)')
}

// Receive WKT string, request NDVI timestack from FIS API and print chart
function updateSidebar(wkt) {
  // Remove tooltip and line from prior parcel selection
  // (otherwise they still show data from another parcel)
  tooltip.style('display', 'none')
  d3.select('#tooltip-line').style('visibility', 'hidden')

  // TODO: fix download button (download json response)
  // fetch(buildRequest(wkt))
  const random_int = Math.floor(Math.random() * 10 + 1);
  fetch(`geodata/fis-jsons/${random_int}.json`)
  .then(response => {
    if (response.ok) {
      return response.json()
    } else {
      // is thrown mainly when id is not valid
      throw new Error(NO_TIMESTACK_FOUND_STRING)
    }
  })
  .then(json => {
    // unblur sidebar and remove sidebar overlay, if it exists
    const children = d3.selectAll('#sidebar > :not(#sidebar-overlay)')

    for(let n of children.nodes()) {
      n.style.filter = ''
    }

    if(document.querySelector('#sidebar').contains(document.querySelector('#sidebar-overlay'))) {
      document.querySelector('#sidebar-overlay').remove()
    }

    // Transform data
    let ndvits = json.C0.reverse()
    console.log(ndvits)
    ndvits = ndvits.map(o => {
      return {
        date: d3.timeParse('%Y-%m-%d')(o.date),
        mean: o.basicStats.mean,
        min : o.basicStats.min,
        max : o.basicStats.max
      }
    })

    console.log(ndvits)

    // Update axis (this might be handy in the future when we have variable date domains)
    const dates = ndvits.map(o => o.date)
    x.domain([ d3.timeDay.offset(d3.min(dates), -2), d3.max(dates) ]) // offset to make space between axis and graphic
    xAxis.call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)))

    // // Construct a Map which has { key: date, value: [Array of points with all bands] }
    // const datemap = new Map(ts.map(o => {
    //
    //   const points = []
    //   for(let i = 1; i <= 8; i++) {
    //     points.push({
    //       point: 'P' + i,
    //       ...Object.fromEntries(  //requires ES2019
    //         Object.entries(o)
    //           .filter(e => e[0].startsWith('P' + i))
    //           .map(e => [ e[0].substring(2), e[1] ]) // strip PX
    //       )
    //     })
    //   }
    //
    //   const metadata = Object.fromEntries(Object.entries(o).filter(e => METADATA_COLS.includes(e[0])))
    //
    //   return [dateFormat(o.Date), { points: points, metadata: metadata }]
    // }))
    //
    // console.log(datemap)

    // Set up D3 visalisation
    graphic.selectAll('.area')
      .data([ndvits])
      .join('path')
        .transition(t)
        .attr('class', 'area')
        .attr('d', area)

    graphic.selectAll('.line-gaps')
      .data([ndvits.filter(line.defined())])
      .join('path')
        .classed('line-gaps', true)
        .transition(t)
        .attr('d', line)

    graphic.selectAll('.line-segments')
      .data([ndvits])
      .join('path')
        .classed('line-segments', true)
        .transition(t)
        .attr('d', line)

    graphic.selectAll('circle')
      .data(ndvits)
      .join('circle')
        .classed('circles-cloudfree', o => o.mean !== 'NaN')
        .classed('circles-cloudy', o => o.mean === 'NaN')
        .transition(t)
        .attr('cx', d => x(d.date))
        .attr('cy', d => y(d.mean))
    console.log(ndvits.filter(line.defined()))

    // // Set up data table
    // // Source: https://www.vis4.net/blog/2015/04/making-html-tables-in-d3-doesnt-need-to-be-a-pain/
    // const datemap_cols = Object.keys( //get column heads from first point sample
    //   datemap.values().next().value.points
    //   .values().next().value
    // ).map(c => { return { head: c, html: r => c == 'NDVI' ? formatDecimals(r[c]) : r[c] } })
    //
    // thead_tr.selectAll('th')
    //   .data(datemap_cols)
    //   .join('th')
    //     .style('min-width', '58px')
    //     .text(c => c.head);


    /*********** INTERACTIVITY ************/

    graphic.on('mouseover', function() {
      tooltip.style('display', 'inline-block')
      d3.select('#tooltip-line').style('visibility', 'visible')
    })

    graphic.on('mousemove', function() {
      const mouse = {
        x: d3.mouse(this)[0],
        y: d3.mouse(this)[1]
      }

      // Snap to closest available date
      // Source: https://bl.ocks.org/alandunning/cfb7dcd7951826b9eacd54f0647f48d3
      const x0 = x.invert(mouse.x)
      const i = bisectDate(ndvits, x0, 1)
      const d0 = ndvits[i - 1]
      const d1 = ndvits[i]
      const o = x0 - d0.date > d1.date - x0 ? d1 : d0;


      // Update tooltip and line
      chart.select('#tooltip-line')
        .attr('x1', x(o.date))
        .attr('x2', x(o.date))
        .attr('y1', y(o.mean))

      // Source: https://www.d3-graph-gallery.com/graph/interactivity_tooltip.html
      tooltip
        .style('left', `${tooltip_scale(x(o.date))}px`)
        .style('top', `${y(o.mean)-90}px`)
        .html(`<b>NDVI ${dateFormat(o.date)}</b><br>` +
              `Mean: ${formatDecimals(o.mean)}<br>` +
              `Max: ${formatDecimals(o.max)}<br>` +
              `Min: ${formatDecimals(o.min)}`)

    //   // Update metadata list
    //   metadata_list.selectAll('li')
    //     .data(Object.entries(datemap.get(dateFormat(o.date)).metadata))
    //     .join('li')
    //       .html(m => `${m[0]}: ${m[1] instanceof Date ? dateFormat(m[1]) : m[1]}`)
    //
    //   // Update table of digital numbers
    //   // Source: https://www.vis4.net/blog/2015/04/making-html-tables-in-d3-doesnt-need-to-be-a-pain/
    //   tbody.selectAll('tr')
    //     .data(datemap.get(dateFormat(o.date)).points)
    //     .join('tr')
    //       .selectAll('td')
    //       .data(function(row, i) {
    //         // evaluate column objects against the current row
    //         return datemap_cols.map(function(c) {
    //           var cell = {};
    //           d3.keys(c).forEach(function(k) {
    //             cell[k] = typeof c[k] == 'function' ? c[k](row,i) : c[k];
    //           });
    //           return cell;
    //         });
    //       })
    //       .join('td')
    //         .html(c => c.html)
    })

    // graphic.on('mouseleave', function() {
    //   // tooltip.style('visibility', 'hidden')
    //   // d3.select('#tooltip-line').style('visibility', 'hidden')
    // })
  })
  .catch(e => {
    // Blur sidebar
    console.error(e)
    const children = d3.selectAll('#sidebar > :not(#sidebar-overlay)')
    for(let n of children.nodes()) {
      n.style.filter = 'blur(4px)'
    }

    // Add overlay with "missing timestack" notice
    if(!document.querySelector('#sidebar').contains(document.querySelector('#sidebar-overlay'))) {
      d3.select('#sidebar').append('div')
        .attr('id', 'sidebar-overlay')
        .style('position', 'absolute')
        .style('width', '100%')
        .style('height', '100%')
        .style('top', 0)
        .style('left', 0)
        .style('display', 'table')
        .append('div')
          .style('display', 'table-cell')
          .style('vertical-align', 'middle')
          .style('text-align', 'center')
          .text(NO_TIMESTACK_FOUND_STRING)
    }
  })
}
