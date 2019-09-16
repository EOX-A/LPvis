'use strict'

const dateFormat = d3.timeFormat('%d.%m.')
const f = d3.format('.3f')
const metadata_cols = ["Week", "Date", "Sensor", "Cloud Cover", "Haze", "Cloud shadow"]
const flag_cols = metadata_cols.slice(3)
let sidebar
let x, y, xAxis, yAxis, chart, graphic, tooltip, thead_tr, tbody, metadata_list, csvurl, tooltip_scale

const area = d3.area()
  .x(d => x(d.date))
  .y0(d => y(d.min)) //baseline
  .y1(d => y(d.max)) //topline
  .defined(d => d.cloudfree)

const line = d3.line()
  .x(d => x(d.date))
  .y(d => y(d.median))
  .defined(d => d.cloudfree)

const t = d3.transition()
  .duration(1250)
  .ease(d3.easeCubicOut);


window.addEventListener('DOMContentLoaded', e => {
    sidebar = document.querySelector('#sidebar')
});

function setUpSidebar() {
  // SVG CHART
  let margin = {top: 20, right: 20, bottom: 20, left: 40},
      width  = sidebar.offsetWidth - margin.left - margin.right,
      height = 300 - margin.top - margin.bottom

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
    .attr('stroke','#000000')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)))

  yAxis = chart.append('g')
    .attr('stroke','#000000')
    .call(d3.axisLeft(y))

  graphic = chart.append('g')

  chart.append('line')
          .attr('id', 'tooltip-line')
          .style('visibility', 'hidden')
          .attr('y2', y(0))
          .attr('stroke', '#000000')

  tooltip = d3.select("#sidebar").append('div')
                                  .attr('id', 'tooltip')
                                  .style('display', 'none')
                                  .style('position', 'absolute')
                                  .style('border', 'black solid 1px')
                                  .style('padding', '6px')
                                  .style('background-color', 'white')


  // DATA TABLE
  const details = d3.select('#sidebar').append('details')
  details.append('summary').text('Metadata and digital numbers')
  metadata_list = details.append('ul')
  const table = details.append('table')
                    .attr('id', 'points-table')
  thead_tr = table.append('thead').append('tr')
  tbody = table.append('tbody')

  // DOWNLOAD BUTTON
  d3.select('#sidebar').append('button')
    .on('click', e => location.href = csvurl)
    .text('Download Timestack (CSV)')
}

function showSidebar() {
  sidebar.style.display = 'block'
  map.invalidateSize()
  if(!sidebar.hasChildNodes()) setUpSidebar()
}

function hideSidebar() {
  sidebar.style.display = 'none'
  map.invalidateSize()
}




function updateSidebar(id) {
  tooltip.style('display', 'none')
  d3.select('#tooltip-line').style('visibility', 'hidden')

  csvurl = `geodata/timestacks/${id}.csv`
  fetch(csvurl)
  .then(response => response.ok ? response.text() : '')
  .then(csv => {
    const ts = d3.csvParse(csv, d => {
      const point_keys = Object.keys(d).filter(k => k.startsWith('P'))
      for(let pk of point_keys) {
        d[pk] = +d[pk]
      }

      d.Date = d3.timeParse('%e/%_m')(d.Date)

      for(let fc of flag_cols) {
        d[fc] = Boolean(+d[fc])
      }

      return d
    })

    console.log(ts)

    for(let o of ts) { // o...observation
      for(let i = 1; i <= 8; i++) {
        o[`P${i}NDVI`] = (o[`P${i}NIR`] - o[`P${i}R`]) / (o[`P${i}NIR`] + o[`P${i}R`])
      }

      const ndvi_keys = Object.keys(o).filter(k => /P\dNDVI/.test(k))
      o.ndvi_median = d3.median(ndvi_keys.map(k => o[k]))
      o.ndvi_max = d3.max(ndvi_keys.map(k => o[k]))
      o.ndvi_min = d3.min(ndvi_keys.map(k => o[k]))

      o.cloudy = false
      for(let fc of flag_cols) {
        o.cloudy = o.cloudy || o[fc]
      }
    }

    const ndvits = ts.map(o => {
      return {
        cloudfree: !o.cloudy,
        date: o.Date,
        median: o.ndvi_median,
        max:  o.ndvi_max,
        min:  o.ndvi_min
      }
    })

    const dates = ndvits.map(ts => ts.date)
    x.domain([d3.timeDay.offset(d3.min(dates),-2),d3.max(dates)])
    xAxis.call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)))

    console.log(ndvits)

    // Construct a map which has { key: date, value: [Array of points with all bands] }
    const datemap = new Map(ts.map(o => {
      const points = []
      for(let i = 1; i <= 8; i++) {
        points.push({
          point: 'P' + i,
          ...Object.fromEntries(Object.entries(o) //requires ES2019
            .filter(e => e[0].startsWith('P' + i))
            .map(e => [e[0].substring(2), e[1]]))
        })
      }

      const metadata = Object.fromEntries(Object.entries(o).filter(e => metadata_cols.includes(e[0])))
      return [dateFormat(o.Date), { points: points, metadata: metadata }]
    }))

    console.log(datemap)

    const datemap_cols = Object.keys( //get column heads from first point sample
      datemap.values().next().value.points
      .values().next().value
    ).map(c => { return { head: c, html: r => c == 'NDVI' ? f(r[c]) : r[c] } })

    /*********** D3 VIS ***********/
    graphic.selectAll('.areas')
      .data([ndvits])
      .join('path')
        .transition(t)
        .attr('class', 'areas')
        .attr('fill','#ffe4b3')
        .attr('stroke', '#ffe4b3')
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'square')
        .attr('d', area)

    graphic.selectAll('.line-gaps')
      .data([ndvits.filter(line.defined())])
      .join('path')
        .transition(t)
        .attr('class', 'line-gaps')
        .attr('fill', 'none')
        .attr('stroke', '#ffe4b3')
        .attr('stroke-width', '2px')
        .attr('stroke-linecap', 'butt')
        .attr('d', line)

    graphic.selectAll('.line-segments')
      .data([ndvits])
      .join('path')
        .transition(t)
        .attr('class', 'line-segments')
        .attr('fill', 'none')
        .attr('stroke', '#ffa500')
        .attr('stroke-width', '2px')
        .attr('stroke-linecap', 'square')
        .attr('d', line)

    graphic.selectAll('circle')
      .data(ndvits)
      .join('circle')
        .classed('circles-cloudfree', o => o.cloudfree)
        .classed('circles-cloudy', o => !o.cloudfree)
        .transition(t)
        .attr('cx', d => x(d.date))
        .attr('cy', d => y(d.median))
        .attr('r', 2  )
    console.log(ndvits.filter(line.defined()))

    /*********** DATA TABLE ************/
    // Source: https://www.vis4.net/blog/2015/04/making-html-tables-in-d3-doesnt-need-to-be-a-pain/
    thead_tr.selectAll('th')
      .data(datemap_cols)
      .join('th')
        .style('min-width', '58px')
        .text(c => c.head);

    /*********** INTERACTIVITY ************/
    // Source: https://bl.ocks.org/alandunning/cfb7dcd7951826b9eacd54f0647f48d3
    const bisectDate = d3.bisector(d=>d.date).left

    graphic.on('mouseover', function() {
      tooltip.style('display', 'inline-block')
      d3.select('#tooltip-line').style('visibility', 'visible')
    })

    graphic.on('mousemove', function() {
      const mouse = {
        x: d3.mouse(this)[0],
        y: d3.mouse(this)[1]
      }

      const x0 = x.invert(mouse.x)
      const i = bisectDate(ndvits, x0, 1)
      const d0 = ndvits[i - 1]
      const d1 = ndvits[i]
      const o = x0 - d0.date > d1.date - x0 ? d1 : d0;

      chart.select('#tooltip-line')
        .attr('x1', x(o.date))
        .attr('x2', x(o.date))
        .attr('y1', y(o.max))

      // Source: https://www.d3-graph-gallery.com/graph/interactivity_tooltip.html
      tooltip
        .style('left', `${tooltip_scale(x(o.date))}px`)
        .style('top', `${y(o.max)-90}px`)
          .html(`<b>NDVI ${dateFormat(o.date)}</b><br>` +
                `Median: ${f(o.median)}<br>` +
                `Max: ${f(o.max)}<br>` +
                `Min: ${f(o.min)}`)

      metadata_list.selectAll('li')
        .data(Object.entries(datemap.get(dateFormat(o.date)).metadata))
        .join('li')
          .html(m => `${m[0]}: ${m[1] instanceof Date ? dateFormat(m[1]) : m[1]}`)

      tbody.selectAll('tr')
        .data(datemap.get(dateFormat(o.date)).points)
        .join('tr')
          .selectAll('td')
          .data(function(row, i) {
            // evaluate column objects against the current row
            return datemap_cols.map(function(c) {
              var cell = {};
              d3.keys(c).forEach(function(k) {
                cell[k] = typeof c[k] == 'function' ? c[k](row,i) : c[k];
              });
              return cell;
            });
          })
          .join('td')
            .html(c => c.html)
    })

    graphic.on('mouseleave', function() {
      // tooltip.style('visibility', 'hidden')
      // d3.select('#tooltip-line').style('visibility', 'hidden')
    })


    console.log(datemap_cols)
  })
}
