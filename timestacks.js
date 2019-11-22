'use strict'

/****** PARAMETERS ******/

const NO_TIMESTACK_FOUND_STRING = 'No timestack available for this parcel'

function EDC_API(strings, parcel_id) { return `/timestacks?parcel_id=${parcel_id}` }


// D3
const dateFormat = d3.timeFormat('%d.%m.') // e.g. 12.3.
const monthFormat = d3.timeFormat('%b %y')
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
    tooltip, tooltip_scale

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
  let margin = {top: 20, right: 20, bottom: 50, left: 40},
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

  graphic = chart.append('g')

  xAxis = chart.append('g')
    .attr('stroke','#ffffff')
    .attr('transform', `translate(0,${height})`)

  yAxis = chart.append('g')
    .attr('stroke','#ffffff')
    .call(d3.axisLeft(y))

  chart.append('line').classed('tooltip-line', true)
    .attr('id', 'tooltip-line')
    .attr('y2', y(0))

  tooltip = d3.select("#sidebar").append('div')
    .classed('tooltip', true)


  // DOWNLOAD BUTTON
  d3.select('#sidebar').append('a')
    .classed('btn download-btn', true)
    .attr('id', 'download-button')
    .html('<i class="fas fa-download"></i> Download Timestack (CSV)')
}

function setFilterOnAllSidebarChildrenButOverlay(filter) {
  const children = d3.selectAll('#sidebar > :not(#sidebar-overlay)')
  for(let n of children.nodes()) {
    n.style.filter = filter
  }
}

function createSidebarOverlayAndReturnMessageDiv() {
  setFilterOnAllSidebarChildrenButOverlay('blur(4px)')

  const som = document.querySelector('.sidebar-overlay-message')
  if(som) {
    return d3.select('.sidebar-overlay-message')
  } else {
    return d3.select('#sidebar').append('div')
      .attr('id', 'sidebar-overlay')
      .append('div')
        .classed('sidebar-overlay-message', true)
  }
}

// Receive parcel id, request NDVI timestack and print chart
function updateSidebar(parcel_id) {
  // Remove tooltip and line from prior parcel selection
  // (otherwise they still show data from another parcel)
  tooltip.style('display', 'none')
  d3.select('#tooltip-line').style('visibility', 'hidden')

  // TODO: fix download button (download json response)
  fetch(edcApi`${parcel_id}`)
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
    setFilterOnAllSidebarChildrenButOverlay('')

    if(document.querySelector('#sidebar-overlay')) {
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
    xAxis.call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickFormat(monthFormat))
         .selectAll('text')
          .style("text-anchor", "end")
          .attr("dx", "-.8em")
          .attr("dy", ".15em")
          .attr("transform", "rotate(-65)");

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
    })
  })
  .catch(e => {
    // Blur sidebar
    console.error(e)
    createSidebarOverlayAndReturnMessageDiv()
      .text(NO_TIMESTACK_FOUND_STRING)
  })
}
