//@ts-nocheck
import { Figure } from "react-plotly.js";

export default async function autoScaling(
  eventdata: Readonly<Plotly.PlotRelayoutEvent>,
  graphs: Figure,
) {
  try {
    if (eventdata["xaxis.range[0]"] !== undefined) {
      const x_min = eventdata["xaxis.range[0]"];
      const x_max = eventdata["xaxis.range[1]"];
      const to_update = {};
      const yaxis_fixedrange = [];
      let y_min;
      let y_max;

      const get_all_yaxis_traces = {};
      const get_all_yaxis_annotations = {};
      let volumeTraceYaxis = null;

      const yaxis_unique = [
        ...new Set(
          graphs.data.map((trace) => {
            if (
              trace.yaxis ||
              trace.y !== undefined ||
              trace.type === "candlestick"
            ) {
              if (trace.type === "bar" && trace?.name?.trim() === "Volume") {
                volumeTraceYaxis = `yaxis${trace.yaxis.replace("y", "")}`;
              }
              get_all_yaxis_traces[trace.yaxis] =
                get_all_yaxis_traces[trace.yaxis] || [];
              get_all_yaxis_traces[trace.yaxis].push(trace);
              return trace.yaxis;
            }
          }),
        ),
      ];

      graphs.layout.annotations.map((annotation, i) => {
        if (annotation.yref !== undefined && annotation.yref !== "paper") {
          annotation.index = i;
          const yaxis = `yaxis${annotation.yref.replace("y", "")}`;
          get_all_yaxis_annotations[yaxis] =
            get_all_yaxis_annotations[yaxis] || [];
          get_all_yaxis_annotations[yaxis].push(annotation);
        }
      });

      yaxis_unique.map((unique) => {
        if (typeof unique !== "string") {
          return;
        }
        const yaxis = `yaxis${unique.replace("y", "")}`;
        let y_candle = [];
        let y_values = [];
        let log_scale = graphs.layout[yaxis].type === "log";

        get_all_yaxis_traces[unique].map((trace2) => {
          const x = trace2.x;
          log_scale = graphs.layout[yaxis].type === "log";

          let y = trace2.y !== undefined ? trace2.y : [];
          let y_low = trace2.type === "candlestick" ? trace2.low : [];
          let y_high = trace2.type === "candlestick" ? trace2.high : [];

          if (log_scale) {
            y = y.map(Math.log10);
            if (trace2.type === "candlestick") {
              y_low = trace2.low.map(Math.log10);
              y_high = trace2.high.map(Math.log10);
            }
          }

          const yx_values = x.map((x, i) => {
            let out = null;
            const isoDateRegex = new RegExp(
              "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}",
            );
            if (isoDateRegex.test(x)) {
              const x_time = new Date(x).getTime();
              const x0_min = new Date(x_min.replace(" ", "T")).getTime();
              const x1_max = new Date(x_max.replace(" ", "T")).getTime();
              if (x_time >= x0_min && x_time <= x1_max) {
                if (trace2.y !== undefined) {
                  out = y[i];
                }
                if (trace2.type === "candlestick") {
                  y_candle.push(y_low[i]);
                  y_candle.push(y_high[i]);
                }
              }
            } else if (x >= x_min && x <= x_max) {
              if (trace2.y !== undefined) {
                out = y[i];
              }
              if (trace2.type === "candlestick") {
                y_candle.push(y_low[i]);
                y_candle.push(y_high[i]);
              }
            }
            return out;
          });

          y_values = y_values.concat(yx_values);
        });

        y_values = y_values.filter((y2) => y2 !== undefined && y2 !== null);
        y_min = Math.min(...y_values);
        y_max = Math.max(...y_values);

        if (y_candle.length > 0) {
          y_candle = y_candle.filter((y2) => y2 !== undefined && y2 !== null);
          y_min = Math.min(...y_candle);
          y_max = Math.max(...y_candle);
        }

        const org_y_max = y_max;

        if (y_min !== undefined && y_max !== undefined) {
          const y_range = y_max - y_min;
          let y_mult = 0.15;
          if (y_candle.length > 0) {
            y_mult = 0.3;
          }

          y_min -= y_range * y_mult;
          y_max += y_range * y_mult;

          if (yaxis === volumeTraceYaxis) {
            if (graphs.layout[yaxis].tickvals !== undefined) {
              const range_x = 7;
              const volume_ticks = org_y_max;
              let round_digits = -3;
              let first_val = Math.round(volume_ticks * 0.2, round_digits);
              const x_zipped = [2, 5, 6, 7, 8, 9, 10];
              const y_zipped = [1, 4, 5, 6, 7, 8, 9];

              for (let i = 0; i < x_zipped.length; i++) {
                if (String(volume_ticks).length > x_zipped[i]) {
                  round_digits = -y_zipped[i];
                  first_val = Math.round(volume_ticks * 0.2, round_digits);
                }
              }
              const tickvals = [
                Math.floor(first_val),
                Math.floor(first_val * 2),
                Math.floor(first_val * 3),
                Math.floor(first_val * 4),
              ];
              const volume_range = [0, Math.floor(volume_ticks * range_x)];

              to_update[`${yaxis}.tickvals`] = tickvals;
              to_update[`${yaxis}.range`] = volume_range;
              to_update[`${yaxis}.tickformat`] = ".2s";
              return;
            }
            y_min = 0;
            y_max = graphs.layout[yaxis].range[1];
          }
          to_update[`${yaxis}.range`] = [y_min, y_max];
          to_update[`${yaxis}.fixedrange`] = true;
          yaxis_fixedrange.push(yaxis);

          if (get_all_yaxis_annotations[yaxis] !== undefined) {
            get_all_yaxis_annotations[yaxis].map((annotation) => {
              if (annotation.ay !== undefined) {
                const yshift = annotation.ay;
                const yshift_new = Math.min(
                  Math.max(yshift, y_min + y_range * 0.2),
                  y_max - y_range * 0.2,
                );

                to_update[`annotations[${annotation.index}].ay`] = yshift_new;
              }
            });
          }
        }
      });

      return { to_update, yaxis_fixedrange };
    }
  } catch (e) {
    console.log(`Error in AutoScaling: ${e}`);
  }
  return { to_update: {}, yaxis_fixedrange: [] };
}
