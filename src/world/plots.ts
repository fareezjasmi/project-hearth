// Reserved development land keeps expansion out of forests, fields and roads.
// Plots are marked in the scene and reserved in the navigation grid from day one.
export const TOWN_PLOTS=[[-25,-6],[-25,3],[-25,12],[-16,21],[-7,21],[2,25],[11,24],[23,22],[29,12],[29,3],[22,-10],[13,-19],[-7,-21],[-17,-22]].map(([x,z],i)=>({id:`town_plot_${i}`,position:{x,z}}));
