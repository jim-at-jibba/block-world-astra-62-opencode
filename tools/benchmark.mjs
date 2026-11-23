import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { performance } from 'node:perf_hooks'

const server = await preview({build:{outDir:'.benchmark'},preview:{port:4193,strictPort:true}})
const browser = await chromium.launch({channel:'chromium', headless:process.env.HEADED!=='1'})
try {
  const page = await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1})
  const cdp = await page.context().newCDPSession(page)
  await page.goto('http://localhost:4193/?test')
  await page.locator('[data-act=new]').click()
  await page.getByLabel('Seed').fill('0')
  const start=performance.now()
  await page.getByRole('button',{name:'Create World'}).click()
  await page.locator('.hud').waitFor()
  const spawnMs=performance.now()-start
  await page.waitForFunction(()=>window.blockworldTest.metrics().queued===0)
  const hardware=await page.evaluate(()=>{
    const gl=document.querySelector('canvas').getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info')
    return info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'unreported'
  })
  const heap=async()=>{await cdp.send('HeapProfiler.collectGarbage');return (await cdp.send('Runtime.getHeapUsage')).usedSize}
  const before=await heap()
  const result=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const game=window.blockworldTest,start=performance.now(),samples=[]
    const origin=game.player().pos.z,edge=Math.round(origin/16)*16
    let previous=start,direction=1,laps=0,longest=0
    const key=(direction,down)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code:direction===1?'KeyW':'KeyS'}))
    key(direction,true)
    function frame(now){
      if(now-start>120000){key(direction,false);reject(new Error('Walking route did not finish'));return}
      if(now-start>10000){samples.push(now-previous);longest=Math.max(longest,now-previous)}
      previous=now
      const z=game.player().pos.z
      if(direction===1?z<edge-.65:z>edge+.65){key(direction,false);direction*=-1;key(direction,true);laps++}
      if(laps<50||samples.length<100){requestAnimationFrame(frame);return}
      key(direction,false)
      samples.sort((a,b)=>a-b)
      resolve({crossings:laps,medianFPS:1000/samples[Math.floor(samples.length/2)],firstPercentileFPS:1000/samples[Math.floor(samples.length*.99)],longestFrameMs:longest,frames:samples.length,loaded:game.metrics().loaded})
    }
    requestAnimationFrame(frame)
  }))
  console.log(JSON.stringify({hardware,spawnMs,...result,retainedHeapMB:((await heap())-before)/1048576},null,2))
} finally {
  await browser.close()
  await new Promise(resolve=>server.httpServer.close(resolve))
}
