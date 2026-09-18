export type CapacityPlanInput = {
  seats:number; tables:number; seatsPerTable?:number; turnsPerDay:number; occupancyPct:number; avgTicket:number;
  operatingDays:number; hoursPerDay?:number; peakHoursPerDay?:number; peakOccupancyPct?:number;
  parkingSpaces?:number; parkingTurnsPerDay?:number; parkingConversionPct?:number; parkingAvgTicket?:number;
  takeawayOrdersPerDay?:number; takeawayConversionPct?:number; takeawayAvgTicket?:number;
  staffPerShift?:number; shiftsPerDay?:number; laborHoursPerStaff?:number; wagePerHour?:number;
  rent?:number; utilities?:number; marketing?:number; otherOpex?:number;
};
export type TargetPlanInput = CapacityPlanInput & { fixedCosts:number; variableCostPct:number; desiredProfit:number; currentRevenue?:number };
export type TargetPlanResult = {
  seatCapacityDaily:number; seatRevenueDaily:number; seatRevenueMonthly:number; parkingCustomerDaily:number; parkingRevenueDaily:number;
  takeawayRevenueDaily:number; takeawayCustomerDaily:number; capacityRevenueDaily:number; capacityRevenueMonthly:number;
  breakEvenRevenue:number; profitTargetRevenue:number; targetRevenue:number; targetDailyRevenue:number; targetTicketCountDaily:number;
  targetSeatTurnsDaily:number; requiredOccupancyPct:number; breakEvenTransactionsDaily:number; capacityUtilizationPct:number;
  achievableBySeatCapacity:boolean; capacityGap:number; currentGap:number; laborCostMonthly:number; opexDetailMonthly:number;
  laborPctOfTarget:number; fixedCostBreakdown:{rent:number;utilities:number;marketing:number;otherOpex:number};
  scenarios:{name:string; revenue:number; profit:number; utilizationPct:number}[]; bottleneck:'dine_in'|'parking'|'takeaway'|'financial'|'none'; assumptions:string[];
};
const pct=(v:number)=>Math.max(0,Math.min(100,Number(v)||0));
export function calculateFnbTargetPlan(i:TargetPlanInput):TargetPlanResult {
  const days=Math.max(1,Number(i.operatingDays)||1), seats=Math.max(0,Number(i.seats)||0), tables=Math.max(0,Number(i.tables)||0);
  const occ=pct(i.occupancyPct)/100, peakOcc=pct(i.peakOccupancyPct??i.occupancyPct)/100, turns=Math.max(0,Number(i.turnsPerDay)||0), ticket=Math.max(0,Number(i.avgTicket)||0);
  const seatCapacityDaily=seats*turns*occ, seatRevenueDaily=seatCapacityDaily*ticket;
  const parkingCustomerDaily=Math.max(0,Number(i.parkingSpaces)||0)*Math.max(0,Number(i.parkingTurnsPerDay)||0)*(pct(i.parkingConversionPct??0)/100);
  const parkingRevenueDaily=parkingCustomerDaily*Math.max(0,Number(i.parkingAvgTicket??i.avgTicket)||0);
  const takeawayCustomerDaily=Math.max(0,Number(i.takeawayOrdersPerDay)||0)*(pct(i.takeawayConversionPct??100)/100);
  const takeawayRevenueDaily=takeawayCustomerDaily*Math.max(0,Number(i.takeawayAvgTicket??i.avgTicket)||0);
  const capacityRevenueDaily=seatRevenueDaily+parkingRevenueDaily+takeawayRevenueDaily, capacityRevenueMonthly=capacityRevenueDaily*days;
  const laborCostMonthly=Math.max(0,Number(i.staffPerShift)||0)*Math.max(0,Number(i.shiftsPerDay)||0)*Math.max(0,Number(i.laborHoursPerStaff)||0)*Math.max(0,Number(i.wagePerHour)||0)*days;
  const rent=Math.max(0,Number(i.rent)||0), utilities=Math.max(0,Number(i.utilities)||0), marketing=Math.max(0,Number(i.marketing)||0), otherOpex=Math.max(0,Number(i.otherOpex)||0);
  const opexDetailMonthly=rent+utilities+marketing+otherOpex, fixed=Math.max(0,Number(i.fixedCosts)||0)+laborCostMonthly+opexDetailMonthly;
  const vc=pct(i.variableCostPct)/100, contribution=Math.max(0.0001,1-vc);
  const breakEvenRevenue=fixed/contribution, profitTargetRevenue=(fixed+Math.max(0,Number(i.desiredProfit)||0))/contribution;
  const targetRevenue=Math.max(breakEvenRevenue,profitTargetRevenue), targetDailyRevenue=targetRevenue/days;
  const targetTicketCountDaily=ticket>0?targetDailyRevenue/ticket:0;
  const seatBase=Math.max(0,seats*turns*ticket), targetSeatTurnsDaily=seats*occ>0?Math.max(0,(targetDailyRevenue-parkingRevenueDaily-takeawayRevenueDaily)/(ticket*seats*occ)):0;
  const requiredOccupancyPct=seats*turns*ticket>0?Math.min(100,Math.max(0,((targetDailyRevenue-parkingRevenueDaily-takeawayRevenueDaily)/(seats*turns*ticket))*100)):0;
  const breakEvenTransactionsDaily=ticket>0?breakEvenRevenue/days/ticket:0;
  const capacityUtilizationPct=capacityRevenueDaily>0?targetDailyRevenue/capacityRevenueDaily*100:Infinity;
  const capacityGap=Math.max(0,targetRevenue-capacityRevenueMonthly), currentGap=Math.max(0,targetRevenue-(Number(i.currentRevenue)||0));
  const laborPctOfTarget=targetRevenue>0?laborCostMonthly/targetRevenue*100:0;
  const scenarios=[
    {name:'Conservative',revenue:capacityRevenueMonthly*.7,profit:capacityRevenueMonthly*.7*(1-vc)-fixed,utilizationPct:70},
    {name:'Base',revenue:capacityRevenueMonthly*.85,profit:capacityRevenueMonthly*.85*(1-vc)-fixed,utilizationPct:85},
    {name:'Stretch',revenue:capacityRevenueMonthly,profit:capacityRevenueMonthly*(1-vc)-fixed,utilizationPct:100}
  ];
  const bottleneck=capacityRevenueDaily<=0?'financial':targetDailyRevenue>capacityRevenueDaily?'dine_in':targetDailyRevenue>capacityRevenueDaily-parkingRevenueDaily?'parking':'none';
  return {seatCapacityDaily,seatRevenueDaily,seatRevenueMonthly:seatRevenueDaily*days,parkingCustomerDaily,parkingRevenueDaily,takeawayRevenueDaily,takeawayCustomerDaily,capacityRevenueDaily,capacityRevenueMonthly,breakEvenRevenue,profitTargetRevenue,targetRevenue,targetDailyRevenue,targetTicketCountDaily,targetSeatTurnsDaily,requiredOccupancyPct,breakEvenTransactionsDaily,capacityUtilizationPct,achievableBySeatCapacity:targetDailyRevenue<=capacityRevenueDaily+0.0001,capacityGap,currentGap,laborCostMonthly,opexDetailMonthly,laborPctOfTarget,fixedCostBreakdown:{rent,utilities,marketing,otherOpex},scenarios,bottleneck,assumptions:[`${seats.toLocaleString('id-ID')} kursi · ${tables.toLocaleString('id-ID')} meja · ${turns.toLocaleString('id-ID')} turn/hari · okupansi ${(occ*100).toFixed(1)}%`,`Peak occupancy ${(peakOcc*100).toFixed(1)}% · ${Number(i.peakHoursPerDay)||0} jam peak`,`Average ticket Rp ${ticket.toLocaleString('id-ID')}`,`${days} hari operasional/bulan`,`Variable cost ${(vc*100).toFixed(1)}%`,`Labor terhitung Rp ${laborCostMonthly.toLocaleString('id-ID')}/bulan`,`Fixed/OPEX detail Rp ${opexDetailMonthly.toLocaleString('id-ID')}/bulan`,`Target profit Rp ${Math.max(0,Number(i.desiredProfit)||0).toLocaleString('id-ID')}`]};
}
