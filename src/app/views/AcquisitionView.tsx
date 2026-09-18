

export function AcquisitionView(){
  // Full-bleed embed: the Acquisition sub-app already has its own hero/explainer
  // and search CTA at the very top of its page, so no redundant description
  // card is added here — it only pushed the real "Find Leads" UI below the fold
  // and forced an extra scroll. .trace-acquisition-embed (tokens.css) cancels
  // .trace-content's padding per breakpoint so the iframe fills the space below
  // the topbar (and above the fixed mobile nav on small screens) with no
  // page-level scrollbar before reaching the tool itself.
  return <div className="trace-acquisition-embed">
    <iframe title="TRACE Acquisition OS" src="/acquisition/index.html?embedded=1" style={{width:'100%',height:'100%',border:0,display:'block',background:'#f6f7f9'}}/>
  </div>
}
