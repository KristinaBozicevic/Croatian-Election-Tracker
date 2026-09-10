import assert from 'node:assert/strict';
import test from 'node:test';
import { BASELINES, DEFAULT_COALITIONS, DISTRICTS, POLL_BASELINE, baselinesFromPolls, coalitionAdjustedDistrict, districtLists, pollWeights, resultForDistrict, weightedBaselineFromPolls } from '../app/model.ts';

const scenario = (changes = {}) => ({ mode:'left', raw:BASELINES.weighted.vals, undecided:BASELINES.weighted.und, undecidedTurnout:85, undecidedTilt:0, localPersistence:65, diasporaHdz:3, minorityLeft:4, coalitions:DEFAULT_COALITIONS, mergeHdzRight:false, ...changes });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('different member losses remove voters and renormalize the remaining district vote', () => {
  const model=scenario({coalitionLoss:{SDP:10,Mozemo:30}});
  const separate=districtLists('I', {...model,mode:'polls'});
  const removed=separate.SDP*.1+separate.Mozemo*.3;
  const result=coalitionAdjustedDistrict('I',model);
  close(result.lostVoteShare,removed);
  close(result.lists['SDP + Mozemo'],(separate.SDP*.9+separate.Mozemo*.7)/(100-removed)*100);
  close(result.lists.HDZ,separate.HDZ/(100-removed)*100);
  close(Object.values(result.lists).reduce((a,b)=>a+b,0),100);
});

test('zero losses preserve the existing allocations and retained solo losses are ignored', () => {
  for(const district of DISTRICTS){
    assert.deepEqual(districtLists(district,scenario()),districtLists(district,scenario({coalitionLoss:{SDP:0,Mozemo:0}})));
    assert.deepEqual(districtLists(district,scenario({mode:'polls'})),districtLists(district,scenario({mode:'polls',coalitionLoss:{SDP:50,Mozemo:50}})));
    assert.equal(resultForDistrict(district,scenario({coalitionLoss:{SDP:40,Mozemo:10}})).autoSeats.length,14);
  }
  assert.deepEqual(districtLists('I',scenario({mode:'user'})),districtLists('I',scenario({mode:'user',coalitionLoss:{SDP:50}})));
});

test('a merged HDZ–DP coalition applies each member loss once', () => {
  const model=scenario({mode:'user',mergeHdzRight:true,coalitions:{left:[],hdz:['HSS'],right:['Most']},coalitionLoss:{HDZ:10,HSS:15,DP:20,Most:25}});
  const separate=districtLists('V',{...model,mode:'polls'});
  const expected=separate.HDZ*.1+separate.HSS*.15+separate.DP*.2+separate.Most*.25;
  const result=coalitionAdjustedDistrict('V',model);
  close(result.lostVoteShare,expected);
  assert.ok(result.lists['HDZ + HSS + DP + Most']>0);
  for(const member of ['HDZ','HSS','DP','Most']) assert.equal(result.lists[member],undefined);
});

test('poll weighting matches the documented recency and square-root-sample formula', () => {
  const polls=[{...POLL_BASELINE[0],date:'2026-09-06',n:1000},{...POLL_BASELINE[1],date:'2026-07-08',n:4000}];
  const weights=pollWeights(polls);
  close(weights[1].ageDays,60);
  close(weights[1].weight/weights[0].weight,2/Math.E);
  close(weights.reduce((sum,row)=>sum+row.normalizedWeight,0),1);
  const average=weightedBaselineFromPolls(polls);
  close(average.vals.SDP,polls[0].v.SDP*weights[0].normalizedWeight+polls[1].v.SDP*weights[1].normalizedWeight);
});

test('latest-poll presets follow refreshed data and preserve shares outside slider bounds', () => {
  const latest={...POLL_BASELINE[1],date:'2026-09-26',v:{...POLL_BASELINE[1].v,HDZ:24.2,SDP:25.1}};
  const sources=baselinesFromPolls([...POLL_BASELINE,latest]);
  assert.equal(sources.ipsos.polls.length,1);
  assert.equal(sources.ipsos.polls[0].date,'2026-09-26');
  assert.equal(sources.ipsos.vals.HDZ,24.2);
  assert.equal(sources.ipsos.vals.SDP,25.1);
  assert.equal(sources.promocija.polls[0].date,'2026-09-06');
  assert.equal(sources.weighted.polls.length,10);
  assert.equal(sources.weighted.polls[0].date,'2026-09-26');
});
