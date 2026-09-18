import { useEffect, useState } from 'react';
import { calculateRecipeCogs, type CogsInput } from '../../core/accounting';
import { loadTraceCollections, asArray, useTraceCollections, money, inputStyle } from './_shared';

export function RecipeCogsView(){
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const [clientId,setClientId]=useState('');
  const [products,setProducts]=useState<Array<Record<string,unknown>>>([]);
  const [items,setItems]=useState<Array<Record<string,unknown>>>([]);
  const [recipes,setRecipes]=useState<Array<Record<string,unknown>>>([]);
  const [qtyByProduct,setQtyByProduct]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState('');

  const refresh=async()=>{
    if(!clientId) return;
    setLoading(true); setMsg('');
    try{
      const {data}=await loadTraceCollections([],['products','inventory_items','inventory_recipes'],clientId);
      setProducts(asArray(data.products).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));
      setItems(asArray(data.inventory_items).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));
      setRecipes(asArray(data.inventory_recipes).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));
    }catch(e){ setMsg(e instanceof Error?e.message:'Gagal memuat data resep.'); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{void refresh()},[clientId]);

  // Sumber data ini sama dengan InventoryView (koleksi products / inventory_items / inventory_recipes) — tidak ada sumber baru yang dibuat.
  const productsWithRecipe=products.filter(p=>recipes.some(r=>String(r.product_id)===String(p.id)));

  const cogsInputs:CogsInput[]=productsWithRecipe.map(p=>{
    const productId=String(p.id);
    const qtyRaw=qtyByProduct[productId];
    const qty=qtyRaw===undefined||qtyRaw===''?1:Number(qtyRaw);
    const components=recipes.filter(r=>String(r.product_id)===productId).map(r=>{
      const item=items.find(i=>String(i.id)===String(r.item_id));
      return { itemId:String(r.item_id), qtyPerSale:Number(r.qty_per_sale), unitCost: item?.unit_cost==null?null:Number(item.unit_cost) };
    });
    return { productId, qty:Number.isFinite(qty)&&qty>0?qty:1, components };
  });
  const results=calculateRecipeCogs(cogsInputs);

  const itemName=(itemId:string)=>String(items.find(i=>String(i.id)===itemId)?.item_name??itemId);

  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}>
      <div className="trace-muted" style={{fontSize:12}}>F&B OPERATIONS · RECIPE COGS</div>
      <h1 style={{margin:'7px 0 5px',fontSize:30}}>HPP per produk, dari resep sungguhan.</h1>
      <div className="trace-muted">Dihitung oleh `calculateRecipeCogs` dari data resep/BOM dan unit cost bahan yang sudah diinput di Inventory &amp; Recipe. Tidak ada input atau sumber data baru di layar ini — kalau resepnya belum lengkap, statusnya ditampilkan apa adanya, bukan ditutupi dengan angka Rp0.</div>
    </div>

    <div className="trace-card">
      <label>Klien<select value={clientId} onChange={e=>setClientId(e.target.value)} style={inputStyle}>
        <option value="">Pilih klien</option>
        {clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}
      </select></label>
      {loading&&<div className="trace-muted" style={{marginTop:8}}>Memuat…</div>}
      {msg&&<div className="trace-muted" style={{marginTop:8}}>{msg}</div>}
    </div>

    {clientId&&<div className="trace-card">
      <strong>HPP Resep per Produk</strong>
      <div className="trace-muted" style={{fontSize:12,marginTop:5}}>
        Qty di bawah hanya untuk simulasi jumlah unit (default 1) — HPP per unit tidak berubah karena rumusnya adalah qty × Σ(qty per sale komponen × unit cost). {productsWithRecipe.length===0?'Belum ada produk dengan resep/BOM tercatat untuk klien ini — tambahkan dulu di tab Inventory & Recipe.':''}
      </div>
      {productsWithRecipe.length>0&&<div style={{overflowX:'auto',marginTop:12}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr>
            <th style={{textAlign:'left',padding:'8px 7px'}}>Produk</th>
            <th style={{textAlign:'right',padding:'8px 7px',width:110}}>Qty</th>
            <th style={{textAlign:'right',padding:'8px 7px'}}>HPP / unit</th>
            <th style={{textAlign:'left',padding:'8px 7px'}}>Status</th>
            <th style={{textAlign:'left',padding:'8px 7px'}}>Item belum lengkap</th>
          </tr></thead>
          <tbody>
            {results.map(r=>{
              const p=productsWithRecipe.find(x=>String(x.id)===r.productId);
              const unitCogs=r.cogs===null?null:r.cogs/r.qty;
              return <tr key={r.productId}>
                <td style={{padding:'8px 7px',borderTop:'1px solid rgba(23,23,23,.06)'}}>{String(p?.product_name??r.productId)}</td>
                <td style={{padding:'8px 7px',borderTop:'1px solid rgba(23,23,23,.06)',textAlign:'right'}}>
                  <input type="number" min={1} step="1" value={qtyByProduct[r.productId]??'1'} onChange={e=>setQtyByProduct({...qtyByProduct,[r.productId]:e.target.value})} style={{...inputStyle,marginTop:0,textAlign:'right',padding:'6px 8px'}}/>
                </td>
                <td style={{padding:'8px 7px',borderTop:'1px solid rgba(23,23,23,.06)',textAlign:'right'}}>{unitCogs===null?'—':money(unitCogs)}</td>
                <td style={{padding:'8px 7px',borderTop:'1px solid rgba(23,23,23,.06)'}}>{r.status==='calculated'?'Calculated':'Insufficient data'}</td>
                <td style={{padding:'8px 7px',borderTop:'1px solid rgba(23,23,23,.06)'}}>{r.missingItemIds.length?r.missingItemIds.map(itemName).join(', '):'—'}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </div>}
  </div>;
}
