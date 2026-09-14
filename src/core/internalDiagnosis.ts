import type { DiagnosticFinding } from './aiDiagnostic.js';
import type { DiagnosisReport } from './diagnosis.js';
import type { LeaderCommandCenter } from './leaderCommandCenter.js';
import type { ActionPlan } from './actionPlan.js';

export type InternalDiagnosisSeverity = 'critical'|'high'|'medium'|'low'|'info';
export type InternalDiagnosisStatus = 'confirmed'|'blocked'|'attention';
export type InternalDiagnosisDomain = 'runtime'|'data'|'workflow'|'security'|'performance'|'business'|'governance';

export interface InternalDiagnosisFinding {
  id:string;
  domain:InternalDiagnosisDomain;
  severity:InternalDiagnosisSeverity;
  status:InternalDiagnosisStatus;
  title:string;
  whatHappened:string;
  evidence:string[];
  why:string;
  impact:string;
  solution:string;
  prevention:string;
  sourceRefs:string[];
}

export interface InternalDiagnosisReport {
  generatedAt:string;
  findings:InternalDiagnosisFinding[];
  conclusion:string;
  limitations:string[];
}

/**
 * Evidence-first internal health diagnosis. It intentionally refuses to turn
 * missing telemetry into a confirmed root cause.
 */
export function diagnoseInternalSystem(input:{
  diagnostics?:DiagnosticFinding[];
  commandCenter?:LeaderCommandCenter;
  businessDiagnoses?:DiagnosisReport[];
  actionPlans?:ActionPlan[];
  now?:Date;
}):InternalDiagnosisReport {
  const findings:InternalDiagnosisFinding[]=[];
  const limitations:string[]=[];
  const diagnostics=input.diagnostics??[];

  for(const d of diagnostics){
    if(d.status==='blocked'){
      findings.push({id:`blocked-${d.id}`,domain:mapDiagnosticDomain(d.category),severity:'medium',status:'blocked',title:`Verifikasi terblokir: ${d.title}`,whatHappened:d.cause,evidence:[d.evidence?.map(e=>e.reason).join('; ') || 'Diagnostic evidence tidak lengkap.'],why:'Sumber pembuktian yang diperlukan belum tersedia atau belum dapat dieksekusi.',impact:'Root cause dan corrective action tidak boleh diklaim sebagai confirmed.',solution:'Lengkapi sumber evidence yang dinyatakan blocked lalu jalankan diagnostic ulang.',prevention:'Release gate harus mempertahankan status blocked sampai evidence tersedia.',sourceRefs:d.evidence?.map(e=>`${e.file}${e.line?`:${e.line}`:''}`)??[]});
    } else if(d.status==='confirmed') {
      findings.push({id:`diag-${d.id}`,domain:mapDiagnosticDomain(d.category),severity:mapSeverity(d.severity),status:'confirmed',title:d.title,whatHappened:d.cause,evidence:[d.evidence?.map(e=>e.reason).join('; ') || d.cause],why:d.evidence?.map(e=>e.reason).join('; ') || 'Confirmed by runtime/static evidence.',impact:`Dampak: ${d.impact??'Tidak ada dampak yang dapat ditentukan dari evidence yang tersedia.'}`,solution:d.solution || 'Investigasi dan perbaiki berdasarkan evidence.',prevention:'Tambahkan regression test atau guard yang menangkap kondisi yang sama.',sourceRefs:d.evidence?.map(e=>`${e.file}${e.line?`:${e.line}`:''}`)??[]});
    }
  }

  const cc=input.commandCenter;
  if(cc){
    if(cc.actionSummary.blocked>0) findings.push({id:'command-blocked-actions',domain:'workflow',severity:cc.actionSummary.blocked>5?'high':'medium',status:'blocked',title:'Action workflow memiliki pekerjaan blocked',whatHappened:`${cc.actionSummary.blocked} action berstatus blocked.`,evidence:[`Command Center actionSummary.blocked=${cc.actionSummary.blocked}`],why:'Root cause blocked belum dapat dibuktikan dari agregat Command Center saja.',impact:'Execution tertahan; penyebab spesifik belum dapat diklaim.',solution:'Drill down action yang blocked dan kumpulkan dependency/evidence konkret sebelum menetapkan root cause.',prevention:'Command Center harus menampilkan evidence/dependency pada level action dan release gate tidak mengubah agregat menjadi root cause.',sourceRefs:['Leader Command Center']});
    if(cc.dataQuality.clientsWithMissingData>0) findings.push({id:'command-data-gaps',domain:'data',severity:'medium',status:'blocked',title:'Sebagian client memiliki data belum lengkap',whatHappened:`${cc.dataQuality.clientsWithMissingData} client belum memiliki coverage 100%.`,evidence:[`Command Center clientsWithMissingData=${cc.dataQuality.clientsWithMissingData}`],why:'Sumber/field yang hilang belum dapat diidentifikasi dari agregat coverage saja.',impact:'Sebagian diagnosis/KPI dapat memiliki limitation.',solution:'Drill down missing fields dan source provenance per client; lengkapi melalui Data Intake/manual evidence.',prevention:'Jangan izinkan data gap berubah menjadi angka nol atau angka buatan; simpan field-level provenance.',sourceRefs:['Leader Command Center']});
  }

  for(const d of input.businessDiagnoses??[]) {
    for(const f of d.findings.filter(x=>x.status==='confirmed' && x.severity!=='info')) {
      findings.push({id:`business-${f.id}-${d.currentPeriod}`,domain:'business',severity:f.severity,status:'confirmed',title:f.title,whatHappened:f.problem,evidence:f.evidence.map(e=>`${e.metric}: current=${e.current??'N/A'}, previous=${e.previous??'N/A'}, change=${e.changePct==null?'N/A':e.changePct+'%'}`),why:f.cause,impact:f.impact,solution:f.recommendation,prevention:'Set KPI/action threshold dan regression evidence untuk memonitor penyebab yang sama pada periode berikutnya.',sourceRefs:f.evidence.map(e=>e.source)});
    }
  }

  for(const p of input.actionPlans??[]) {
    const completedWithoutEvidence=p.items.filter(i=>i.status==='completed'&&i.evidence.length===0);
    if(completedWithoutEvidence.length) {
      findings.push({id:`action-evidence-${p.clientId}`,domain:'governance',severity:'high',status:'confirmed',title:'Completed action tanpa evidence',whatHappened:`${completedWithoutEvidence.length} action ditandai completed tanpa evidence.`,evidence:completedWithoutEvidence.map(x=>x.id),why:'State completion tidak memenuhi contract evidence.',impact:'Progress dapat terlihat selesai padahal tidak dapat diverifikasi.',solution:'Kembalikan action ke state yang sesuai dan lampirkan evidence yang dapat diverifikasi.',prevention:'Enforce server-side transition guard, bukan hanya validasi UI.' ,sourceRefs:['Action Plan']});
    }
  }

  if(!diagnostics.length && !cc && !(input.businessDiagnoses?.length) && !(input.actionPlans?.length)) limitations.push('Tidak ada diagnostic, Command Center, diagnosis bisnis, atau action plan evidence yang diberikan. Internal diagnosis tidak dapat mengklaim sistem sehat.');
  const confirmed=findings.filter(f=>f.status==='confirmed');
  const blocked=findings.filter(f=>f.status==='blocked');
  const attention=findings.filter(f=>f.status==='attention');
  const conclusion=findings.length
    ? `${findings.length} finding internal membutuhkan tindak lanjut; ${confirmed.length} terkonfirmasi, ${blocked.length} masih blocked, ${attention.length} berstatus attention.`
    : 'Tidak ada finding internal yang dapat dikonfirmasi dari evidence yang tersedia.';
  return {generatedAt:(input.now??new Date()).toISOString(),findings,conclusion,limitations};
}

function mapDiagnosticDomain(c:string):InternalDiagnosisDomain {
  if(c==='security') return 'security'; if(c==='performance') return 'performance'; if(c==='missing_data'||c==='file_ingestion') return 'data'; if(c==='persistence'||c==='integration') return 'workflow'; if(c==='runtime_risk'||c==='syntax'||c==='missing_dependency') return 'runtime'; return 'governance';
}
function mapSeverity(s:string):InternalDiagnosisSeverity { return s==='critical'?'critical':s==='high'?'high':s==='medium'?'medium':s==='low'?'low':'info'; }
