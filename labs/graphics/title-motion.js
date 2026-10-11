// Gentle foreground drift and a one-shot, fixed-width digital lore reveal.
export function titleMotion(title,now){
 if(title.openedAt==null)title.openedAt=now;
 const elapsed=Math.max(0,now-title.openedAt);
 if(title.reducedMotion)return {elapsed:Infinity,logoX:0,logoY:0,loreY:0};
 const t=elapsed/1000;
 return {elapsed,logoX:2*Math.sin(t*Math.PI*2/62),logoY:4*Math.sin(t*Math.PI*2/48),loreY:1.5*Math.sin(t*Math.PI*2/64)};
}
export function loreLineFrame(line,row,elapsed){
 if(elapsed>=2400)return line;
 const symbols='01/:·_';
 return Array.from(line,(ch,i)=>{
  if(ch===' ')return ' ';
  const hash=((i+1)*73+(row+1)*137)%151;
  const start=100+row*95+i/Math.max(1,line.length-1)*480+hash;
  if(elapsed<start)return ' ';
  if(elapsed>=start+180)return ch;
  return symbols[(Math.floor(elapsed/55)+hash)%symbols.length];
 }).join('');
}
