import assert from 'node:assert/strict';
import { buildBusinessTwin, validateHierarchy } from '../dist/core/business.js';
const data = {
  clients:[{id:'c1',name:'Client A',status:'active'}],
  companies:[{id:'co1',clientId:'c1',name:'Company A',status:'active'}],
  brands:[{id:'b1',companyId:'co1',name:'Brand A',status:'active'}],
  outlets:[{id:'o1',brandId:'b1',name:'Outlet A',status:'active'}]
};
assert.deepEqual(validateHierarchy(data), []);
assert.deepEqual(buildBusinessTwin(data,'c1')?.counts,{companies:1,brands:1,outlets:1});
assert.equal(buildBusinessTwin(data,'missing'), null);
assert.equal(validateHierarchy({...data,outlets:[{id:'o2',brandId:'missing',name:'bad',status:'active'}]}).length,1);
console.log('PASS business hierarchy core');
