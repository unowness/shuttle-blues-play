// A quiet upper-left to lower-right pass, clipped to existing front-face pixels.
// Intensity changes only: the accepted Broken Signal geometry is never touched.
import { TITLE_ART, titleArtFrame } from './title-art.js';
const lift=(hex,amount)=>'#'+hex.slice(1).match(/../g).map(c=>{
 const n=parseInt(c,16);return Math.round(n+(255-n)*amount).toString(16).padStart(2,'0');
}).join('');
export function titleSheenPhase(now,reducedMotion=false){
 if(reducedMotion)return null;
 const t=Math.max(0,Number.isFinite(now)?now:0)%14000;
 return t<3200?t/3200:null;
}
export function drawTitleSheen(r,at,colors,{now=0,reducedMotion=false,art=TITLE_ART}={}){
 const phase=titleSheenPhase(now,reducedMotion);if(phase===null||art!==TITLE_ART)return;
 const frame=titleArtFrame(now,false,art),ux=at.w/art.width,uy=at.h/art.height;
 // A diagonal wavefront whose centre travels along the top-left / bottom-right axis.
 const centre=-.09+phase*1.18;
 const shades={w:[colors.w,lift(colors.w,.015),lift(colors.w,.03)],b:[colors.b,lift(colors.b,.03),lift(colors.b,.055)]};
 for(let y=0;y<art.height;y++)for(let x=0;x<art.width;x++){
  const ink=frame.rows[y][x];if(!shades[ink])continue;
  const distance=Math.abs((x/art.width+y/art.height)/2-centre);
  const level=distance<.013?2:distance<.028?1:0;if(!level)continue;
  const xx=Math.round(at.x+x*ux),yy=Math.round(at.y+y*uy);
  r.fill(xx,yy,Math.round(at.x+(x+1)*ux)-xx,Math.round(at.y+(y+1)*uy)-yy,shades[ink][level]);
 }
}
