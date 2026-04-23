      type RankThresholds = {
        beginner: number;
        novice: number;
        intermediate: number;
        advanced: number;
        elite: number;
      };

      type RankLevel =
        | "beginner"
        | "novice"
        | "intermediate"
        | "advanced"
        | "elite";

      type VdotLevel = {
        label: string;
        men: number;
        women: number;
        description: string;
      };

      type GenderValue = "male" | "female";

      type BenchmarkDistanceKey = "5k" | "10k" | "half-marathon" | "marathon";

      const raceRankThresholds = new Map<string, RankThresholds>();
      const raceRankDisplayTimes = new Map<string, string>();
      const raceRankAgeGroups = new Set<string>();
      let raceRankDataLoaded = false;
      let raceRankDataFailed = false;

      const vdotLevels: VdotLevel[] = [
        {
          label: "Beginner",
          men: 35,
          women: 31.4,
          description: "New to structured running; building aerobic base",
        },
        {
          label: "Novice",
          men: 40,
          women: 35.8,
          description: "Running consistently with improving pace control",
        },
        {
          label: "Intermediate Recreational",
          men: 50,
          women: 44.6,
          description: "Solid club-level fitness and endurance",
        },
        {
          label: "High-Level Recreational",
          men: 60,
          women: 53.4,
          description: "Strong age-group competitor with fast times",
        },
        {
          label: "Sub-Elite",
          men: 70,
          women: 62.2,
          description: "Regional-caliber performance and training volume",
        },
        {
          label: "National Class",
          men: 75,
          women: 66.6,
          description: "Nationally competitive standard in many events",
        },
        {
          label: "Elite",
          men: 80,
          women: 71,
          description:
            "International-level potential with exceptional race speed",
        },
      ];

      const calculateVdot = (
        distanceMeters: number,
        totalSeconds: number,
      ): number | null => {
        const minutes = totalSeconds / 60;

        if (minutes <= 0) {
          return null;
        }

        const velocity = distanceMeters / minutes;
        const vo2 = -4.6 + 0.182258 * velocity + 0.000104 * velocity * velocity;
        const percentMax =
          0.8 +
          0.1894393 * Math.exp(-0.012778 * minutes) +
          0.2989558 * Math.exp(-0.1932605 * minutes);

        if (percentMax <= 0) {
          return null;
        }

        const vdot = vo2 / percentMax;

        if (!Number.isFinite(vdot) || vdot <= 0) {
          return null;
        }

        return vdot;
      };

      const classifyVdot = (vdot: number, gender: GenderValue): string => {
        const targetKey = gender === "male" ? "men" : "women";

        for (const level of vdotLevels.slice().reverse()) {
          if (vdot >= level[targetKey]) {
            return level.label;
          }
        }

        return "Below Beginner";
      };

      const benchmarkDistanceLabels: Record<string, string> = {
        "5k": "5K",
        "10k": "10K",
        "half-marathon": "Half Marathon",
        marathon: "Marathon",
      };

      const benchmarkRankOrder: RankLevel[] = [
        "beginner",
        "novice",
        "intermediate",
        "advanced",
        "elite",
      ];

      const pad = (value: number) =>
        String(Math.floor(Math.abs(value))).padStart(2, "0");

      const formatTime = (totalSeconds: number) => {
        if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
          return "00:00:00";
        }

        const wholeSeconds = Math.floor(totalSeconds);
        const hours = Math.floor(wholeSeconds / 3600);
        const minutes = Math.floor((wholeSeconds % 3600) / 60);
        const seconds = wholeSeconds % 60;

        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
      };

      const formatPace = (totalSeconds: number) => {
        if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
          return "0 seconds";
        }

        const roundedSeconds = Math.round(totalSeconds);
        const hours = Math.floor(roundedSeconds / 3600);
        const minutes = Math.floor((roundedSeconds % 3600) / 60);
        const seconds = roundedSeconds % 60;

        const parts = [];

        if (hours > 0) {
          parts.push(`${hours} hours`);
        }

        if (minutes > 0) {
          parts.push(`${minutes} minutes`);
        }

        if (seconds > 0 || parts.length === 0) {
          parts.push(`${seconds} seconds`);
        }

        return parts.join(" ");
      };

      const readNumber = (input: HTMLInputElement) => {
        const value = Number.parseFloat(input.value);
        return Number.isFinite(value) ? value : 0;
      };

      const readDurationPart = (input: HTMLInputElement) => {
        const value = readNumber(input);
        return Math.min(59, Math.max(0, value));
      };

      const parseClockTimeToSeconds = (value: string) => {
        const parts = value.split(":").map((part) => Number.parseInt(part, 10));

        if (parts.some((part) => Number.isNaN(part))) {
          return null;
        }

        if (parts.length === 2) {
          const [minutes, seconds] = parts;
          return minutes * 60 + seconds;
        }

        if (parts.length === 3) {
          const [hours, minutes, seconds] = parts;
          return hours * 3600 + minutes * 60 + seconds;
        }

        return null;
      };

      const buildRaceRankKey = (
        distance: string,
        ageGroup: string,
        gender: string,
      ) => `${distance}|${ageGroup}|${gender}`;

      const buildRaceRankDisplayKey = (
        distance: string,
        ageGroup: string,
        gender: string,
        rank: RankLevel,
      ) => `${distance}|${ageGroup}|${gender}|${rank}`;

      const formatRankLabel = (rank: RankLevel) =>
        rank.slice(0, 1).toUpperCase() + rank.slice(1);

      const getRankDistanceKey = (
        presetValue: string,
        usingCustomDistance: boolean,
      ) => {
        if (usingCustomDistance) {
          return null;
        }

        if (presetValue === "5000") {
          return "5k";
        }

        if (presetValue === "10000") {
          return "10k";
        }

        if (presetValue === "21098.75") {
          return "half-marathon";
        }

        if (presetValue === "42195") {
          return "marathon";
        }

        return null;
      };

      const classifyRaceRank = (
        timeSeconds: number,
        thresholds: RankThresholds,
      ) => {
        if (timeSeconds <= thresholds.elite) {
          return "Elite";
        }

        if (timeSeconds <= thresholds.advanced) {
          return "Advanced";
        }

        if (timeSeconds <= thresholds.intermediate) {
          return "Intermediate";
        }

        if (timeSeconds <= thresholds.novice) {
          return "Novice";
        }

        if (timeSeconds <= thresholds.beginner) {
          return "Beginner";
        }

        return "Below Beginner";
      };

      const loadRaceRankData = async () => {
        try {
          const response = await fetch("/f2/data/race-ranks.csv");

          if (!response.ok) {
            throw new Error(`Failed to load CSV (${response.status})`);
          }

          const text = await response.text();
          const lines = text
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0);

          if (lines.length <= 1) {
            throw new Error("CSV has no data rows");
          }

          for (let index = 1; index < lines.length; index += 1) {
            const row = lines[index].split(",").map((value) => value.trim());

            if (row.length !== 8) {
              continue;
            }

            const [
              distance,
              ageGroup,
              gender,
              beginner,
              novice,
              intermediate,
              advanced,
              elite,
            ] = row;
            const beginnerSeconds = parseClockTimeToSeconds(beginner);
            const noviceSeconds = parseClockTimeToSeconds(novice);
            const intermediateSeconds = parseClockTimeToSeconds(intermediate);
            const advancedSeconds = parseClockTimeToSeconds(advanced);
            const eliteSeconds = parseClockTimeToSeconds(elite);

            if (
              beginnerSeconds === null ||
              noviceSeconds === null ||
              intermediateSeconds === null ||
              advancedSeconds === null ||
              eliteSeconds === null
            ) {
              continue;
            }

            raceRankThresholds.set(
              buildRaceRankKey(distance, ageGroup, gender),
              {
                beginner: beginnerSeconds,
                novice: noviceSeconds,
                intermediate: intermediateSeconds,
                advanced: advancedSeconds,
                elite: eliteSeconds,
              },
            );
            raceRankDisplayTimes.set(
              buildRaceRankDisplayKey(distance, ageGroup, gender, "beginner"),
              beginner,
            );
            raceRankDisplayTimes.set(
              buildRaceRankDisplayKey(distance, ageGroup, gender, "novice"),
              novice,
            );
            raceRankDisplayTimes.set(
              buildRaceRankDisplayKey(
                distance,
                ageGroup,
                gender,
                "intermediate",
              ),
              intermediate,
            );
            raceRankDisplayTimes.set(
              buildRaceRankDisplayKey(distance, ageGroup, gender, "advanced"),
              advanced,
            );
            raceRankDisplayTimes.set(
              buildRaceRankDisplayKey(distance, ageGroup, gender, "elite"),
              elite,
            );
            raceRankAgeGroups.add(ageGroup);
          }

          raceRankDataLoaded = true;
        } catch {
          raceRankDataFailed = true;
        }
      };

      const initBenchmarks = () => {
        const benchmarkViewElement = document.getElementById("benchmark-view");
        const distanceSelectElement =
          document.getElementById("benchmark-distance");
        const rankSelectElement = document.getElementById("benchmark-rank");
        const genderFilterElement = document.getElementById("benchmark-gender");
        const benchmarkChartWrapElement = document.getElementById(
          "benchmark-chart-wrap",
        );
        const benchmarkChartElement =
          document.getElementById("benchmark-chart");
        const benchmarkChartSummaryElement = document.getElementById(
          "benchmark-chart-summary",
        );
        const benchmarkChartLegendElement = document.getElementById(
          "benchmark-chart-legend",
        );
        const benchmarkTableWrapElement = document.getElementById(
          "benchmark-table-wrap",
        );
        const benchmarkBodyElement = document.getElementById("benchmark-body");
        const benchmarkCaptionElement =
          document.getElementById("benchmark-caption");
        const benchmarkTableElement = benchmarkBodyElement?.closest("table");
        const benchmarkHeadRowElement =
          benchmarkTableElement?.querySelector("thead tr");

        if (
          !(benchmarkViewElement instanceof HTMLSelectElement) ||
          !(distanceSelectElement instanceof HTMLSelectElement) ||
          !(rankSelectElement instanceof HTMLSelectElement) ||
          !(genderFilterElement instanceof HTMLSelectElement) ||
          !(benchmarkChartWrapElement instanceof HTMLElement) ||
          !(benchmarkChartElement instanceof SVGSVGElement) ||
          !(benchmarkChartSummaryElement instanceof HTMLElement) ||
          !(benchmarkChartLegendElement instanceof HTMLUListElement) ||
          !(benchmarkTableWrapElement instanceof HTMLElement) ||
          !(benchmarkBodyElement instanceof HTMLTableSectionElement) ||
          !(benchmarkCaptionElement instanceof HTMLTableCaptionElement) ||
          !(benchmarkTableElement instanceof HTMLTableElement) ||
          !(benchmarkHeadRowElement instanceof HTMLTableRowElement)
        ) {
          return;
        }

        const benchmarkView = benchmarkViewElement;
        const distanceSelect = distanceSelectElement;
        const rankSelect = rankSelectElement;
        const genderFilter = genderFilterElement;
        const benchmarkChartWrap = benchmarkChartWrapElement;
        const benchmarkChart = benchmarkChartElement;
        const benchmarkChartSummary = benchmarkChartSummaryElement;
        const benchmarkChartLegend = benchmarkChartLegendElement;
        const benchmarkTableWrap = benchmarkTableWrapElement;
        const benchmarkBody = benchmarkBodyElement;
        const benchmarkCaption = benchmarkCaptionElement;
        const benchmarkHeadRow = benchmarkHeadRowElement;

        type ChartPoint = {
          ageGroup: string;
          seconds: number;
        };

        type ChartSeries = {
          label: string;
          color: string;
          points: ChartPoint[];
        };

        const chartPalette = [
          "#2563eb",
          "#dc2626",
          "#16a34a",
          "#9333ea",
          "#ea580c",
          "#0891b2",
          "#be123c",
          "#4f46e5",
          "#15803d",
          "#0f766e",
        ];

        const svgNamespace = "http://www.w3.org/2000/svg";

        const renderChartMessage = (message: string) => {
          benchmarkChartSummary.textContent = message;
          benchmarkChart.replaceChildren();
          benchmarkChartLegend.innerHTML = "";
        };

        const updateBenchmarkView = () => {
          const showChart = benchmarkView.value === "chart";
          benchmarkChartWrap.hidden = !showChart;
          benchmarkTableWrap.hidden = showChart;
        };

        const createChartSeries = (
          distanceKey: BenchmarkDistanceKey,
          rankLevels: RankLevel[],
          selectedRank: string,
          selectedGender: string,
          sortedAgeGroups: string[],
        ): ChartSeries[] => {
          const genders: GenderValue[] =
            selectedGender === "male" || selectedGender === "female"
              ? [selectedGender]
              : ["male", "female"];

          return rankLevels
            .flatMap((rankLevel, rankIndex) =>
              genders.map((gender, genderIndex) => {
                const points = sortedAgeGroups
                  .map((ageGroup) => {
                    const timeValue = raceRankDisplayTimes.get(
                      buildRaceRankDisplayKey(
                        distanceKey,
                        ageGroup,
                        gender,
                        rankLevel,
                      ),
                    );
                    const seconds = timeValue
                      ? parseClockTimeToSeconds(timeValue)
                      : null;

                    if (seconds === null) {
                      return null;
                    }

                    return {
                      ageGroup,
                      seconds,
                    };
                  })
                  .filter((point): point is ChartPoint => point !== null);

                const label =
                  selectedRank === "all" && selectedGender === "all"
                    ? `${formatRankLabel(rankLevel)} ${gender === "male" ? "Men" : "Women"}`
                    : selectedRank === "all"
                      ? formatRankLabel(rankLevel)
                      : selectedGender === "all"
                        ? gender === "male"
                          ? "Men"
                          : "Women"
                        : formatRankLabel(rankLevel);

                const colorIndex = rankIndex * 2 + genderIndex;

                return {
                  label,
                  color: chartPalette[colorIndex % chartPalette.length],
                  points,
                };
              }),
            )
            .filter((series) => series.points.length > 0);
        };

        const renderBenchmarkChart = (
          distanceKey: BenchmarkDistanceKey,
          rankLevels: RankLevel[],
          selectedRank: string,
          selectedGender: string,
          sortedAgeGroups: string[],
          captionText: string,
        ) => {
          const series = createChartSeries(
            distanceKey,
            rankLevels,
            selectedRank,
            selectedGender,
            sortedAgeGroups,
          );

          if (series.length === 0) {
            renderChartMessage("No chart data found for this selection.");
            return;
          }

          const allSeconds = series.flatMap((entry) =>
            entry.points.map((point) => point.seconds),
          );

          if (allSeconds.length === 0) {
            renderChartMessage("No chart data found for this selection.");
            return;
          }

          const minSeconds = Math.min(...allSeconds);
          const maxSeconds = Math.max(...allSeconds);
          const spread = Math.max(60, maxSeconds - minSeconds);
          const domainMin = Math.max(0, minSeconds - spread * 0.1);
          const domainMax = maxSeconds + spread * 0.1;
          const width = 720;
          const height = 360;
          const padding = {
            top: 20,
            right: 22,
            bottom: 42,
            left: 62,
          };
          const plotWidth = width - padding.left - padding.right;
          const plotHeight = height - padding.top - padding.bottom;
          const visibleAges = sortedAgeGroups.filter((ageGroup) =>
            series.some((entry) =>
              entry.points.some((point) => point.ageGroup === ageGroup),
            ),
          );

          if (visibleAges.length === 0) {
            renderChartMessage("No chart data found for this selection.");
            return;
          }

          const ageIndexMap = new Map(
            visibleAges.map((ageGroup, index) => [ageGroup, index]),
          );

          const xForAge = (ageGroup: string) => {
            const ageIndex = ageIndexMap.get(ageGroup) ?? 0;

            if (visibleAges.length === 1) {
              return padding.left + plotWidth / 2;
            }

            return (
              padding.left + (ageIndex / (visibleAges.length - 1)) * plotWidth
            );
          };

          const yForSeconds = (seconds: number) => {
            const ratio = (seconds - domainMin) / (domainMax - domainMin);
            return padding.top + plotHeight - ratio * plotHeight;
          };

          benchmarkChart.replaceChildren();

          const background = document.createElementNS(svgNamespace, "rect");
          background.setAttribute("x", String(padding.left));
          background.setAttribute("y", String(padding.top));
          background.setAttribute("width", String(plotWidth));
          background.setAttribute("height", String(plotHeight));
          background.setAttribute("fill", "#ffffff");
          background.setAttribute("stroke", "#e5e7eb");
          benchmarkChart.append(background);

          const tickCount = 5;

          for (let index = 0; index < tickCount; index += 1) {
            const ratio = index / (tickCount - 1);
            const secondsValue = domainMax - (domainMax - domainMin) * ratio;
            const y = yForSeconds(secondsValue);
            const gridLine = document.createElementNS(svgNamespace, "line");
            gridLine.setAttribute("x1", String(padding.left));
            gridLine.setAttribute("x2", String(width - padding.right));
            gridLine.setAttribute("y1", String(y));
            gridLine.setAttribute("y2", String(y));
            gridLine.setAttribute("stroke", "#e5e7eb");
            gridLine.setAttribute("stroke-width", "1");
            benchmarkChart.append(gridLine);

            const tickLabel = document.createElementNS(svgNamespace, "text");
            tickLabel.setAttribute("x", String(padding.left - 8));
            tickLabel.setAttribute("y", String(y + 4));
            tickLabel.setAttribute("text-anchor", "end");
            tickLabel.setAttribute("font-size", "12");
            tickLabel.setAttribute("fill", "#374151");
            tickLabel.textContent = formatTime(Math.round(secondsValue));
            benchmarkChart.append(tickLabel);
          }

          const axisX = document.createElementNS(svgNamespace, "line");
          axisX.setAttribute("x1", String(padding.left));
          axisX.setAttribute("x2", String(width - padding.right));
          axisX.setAttribute("y1", String(height - padding.bottom));
          axisX.setAttribute("y2", String(height - padding.bottom));
          axisX.setAttribute("stroke", "#4b5563");
          axisX.setAttribute("stroke-width", "1");
          benchmarkChart.append(axisX);

          const axisY = document.createElementNS(svgNamespace, "line");
          axisY.setAttribute("x1", String(padding.left));
          axisY.setAttribute("x2", String(padding.left));
          axisY.setAttribute("y1", String(padding.top));
          axisY.setAttribute("y2", String(height - padding.bottom));
          axisY.setAttribute("stroke", "#4b5563");
          axisY.setAttribute("stroke-width", "1");
          benchmarkChart.append(axisY);

          const xLabelStep = visibleAges.length > 10 ? 2 : 1;

          visibleAges.forEach((ageGroup, index) => {
            if (index % xLabelStep !== 0 && index !== visibleAges.length - 1) {
              return;
            }

            const x = xForAge(ageGroup);
            const tick = document.createElementNS(svgNamespace, "line");
            tick.setAttribute("x1", String(x));
            tick.setAttribute("x2", String(x));
            tick.setAttribute("y1", String(height - padding.bottom));
            tick.setAttribute("y2", String(height - padding.bottom + 5));
            tick.setAttribute("stroke", "#4b5563");
            tick.setAttribute("stroke-width", "1");
            benchmarkChart.append(tick);

            const label = document.createElementNS(svgNamespace, "text");
            label.setAttribute("x", String(x));
            label.setAttribute("y", String(height - padding.bottom + 18));
            label.setAttribute("text-anchor", "middle");
            label.setAttribute("font-size", "12");
            label.setAttribute("fill", "#374151");
            label.textContent = ageGroup;
            benchmarkChart.append(label);
          });

          series.forEach((entry) => {
            const coordinates = entry.points.map((point) => {
              const x = xForAge(point.ageGroup);
              const y = yForSeconds(point.seconds);
              return `${x},${y}`;
            });

            if (coordinates.length === 0) {
              return;
            }

            const linePath = document.createElementNS(svgNamespace, "polyline");
            linePath.setAttribute("points", coordinates.join(" "));
            linePath.setAttribute("fill", "none");
            linePath.setAttribute("stroke", entry.color);
            linePath.setAttribute("stroke-width", "2.5");
            linePath.setAttribute("stroke-linecap", "round");
            linePath.setAttribute("stroke-linejoin", "round");
            benchmarkChart.append(linePath);

            entry.points.forEach((point) => {
              const circle = document.createElementNS(svgNamespace, "circle");
              circle.setAttribute("cx", String(xForAge(point.ageGroup)));
              circle.setAttribute("cy", String(yForSeconds(point.seconds)));
              circle.setAttribute("r", "3");
              circle.setAttribute("fill", entry.color);
              benchmarkChart.append(circle);
            });
          });

          benchmarkChartSummary.textContent = `${captionText}. Lower times are faster.`;
          benchmarkChartLegend.innerHTML = series
            .map(
              (entry) => `<li>
                <svg class="benchmark-legend-key" aria-hidden="true" viewBox="0 0 28 12">
                  <line x1="1" y1="6" x2="27" y2="6" stroke="${entry.color}" stroke-width="3" stroke-linecap="round"></line>
                  <circle cx="14" cy="6" r="4" fill="${entry.color}" stroke="#ffffff" stroke-width="2"></circle>
                </svg>
                <span class="benchmark-legend-label">${entry.label}</span>
              </li>`,
            )
            .join("");
        };

        const setBenchmarkHeader = (columns: string[]) => {
          benchmarkHeadRow.innerHTML = columns
            .map((column) => `<th scope="col">${column}</th>`)
            .join("");
        };

        const renderBenchmarkMessageRow = (
          message: string,
          columnCount: number,
        ) => {
          benchmarkBody.innerHTML = `<tr><td colspan="${columnCount}">${message}</td></tr>`;
        };

        const renderBenchmarkRows = () => {
          updateBenchmarkView();

          const selectedDistance = distanceSelect.value;
          const selectedRank = rankSelect.value;
          const selectedGender = genderFilter.value;
          const showRankColumn = selectedRank === "all";
          const singleGender =
            selectedGender === "male" || selectedGender === "female";
          const benchmarkColumns = singleGender
            ? [
                "Age Group",
                ...(showRankColumn
                  ? benchmarkRankOrder.map((rankLevel) =>
                      formatRankLabel(rankLevel),
                    )
                  : [selectedGender === "male" ? "Men" : "Women"]),
              ]
            : [
                ...(showRankColumn ? ["Rank"] : []),
                "Age Group",
                "Men",
                "Women",
              ];
          const columnCount = benchmarkColumns.length;

          setBenchmarkHeader(benchmarkColumns);

          if (raceRankDataFailed) {
            benchmarkCaption.textContent =
              "Race rank benchmark data unavailable";
            renderBenchmarkMessageRow(
              "Unable to load benchmark data.",
              columnCount,
            );
            renderChartMessage("Unable to load benchmark data.");
            return;
          }

          if (!raceRankDataLoaded) {
            benchmarkCaption.textContent = "Loading benchmark data...";
            renderBenchmarkMessageRow("Loading benchmark data...", columnCount);
            renderChartMessage("Loading benchmark data...");
            return;
          }

          const distanceKeys: BenchmarkDistanceKey[] = [
            selectedDistance as BenchmarkDistanceKey,
          ];
          const rankLevels: RankLevel[] =
            selectedRank === "all"
              ? benchmarkRankOrder
              : [selectedRank as RankLevel];

          if (
            distanceKeys.some(
              (distanceKey) => !benchmarkDistanceLabels[distanceKey],
            ) ||
            rankLevels.length === 0
          ) {
            benchmarkCaption.textContent = "Pace times by age group";
            renderBenchmarkMessageRow("Select supported filters.", columnCount);
            renderChartMessage("Select supported filters.");
            return;
          }

          const distanceText =
            benchmarkDistanceLabels[selectedDistance as BenchmarkDistanceKey];
          const rankText =
            selectedRank === "all"
              ? "all ranks"
              : `${formatRankLabel(selectedRank as RankLevel)} rank`;
          const genderText =
            selectedGender === "male"
              ? "men"
              : selectedGender === "female"
                ? "women"
                : "men and women";
          benchmarkCaption.textContent = `${distanceText}, ${rankText} pace times by age group (${genderText})`;

          const sortedAgeGroups = Array.from(raceRankAgeGroups).sort(
            (first, second) =>
              Number.parseInt(first, 10) - Number.parseInt(second, 10),
          );

          const rows =
            singleGender && selectedRank === "all"
              ? distanceKeys
                  .flatMap((distanceKey) =>
                    sortedAgeGroups
                      .map((ageGroup) => {
                        const gender = selectedGender as GenderValue;
                        const rankCells = benchmarkRankOrder.map(
                          (rankLevel) =>
                            raceRankDisplayTimes.get(
                              buildRaceRankDisplayKey(
                                distanceKey,
                                ageGroup,
                                gender,
                                rankLevel,
                              ),
                            ) ?? "N/A",
                        );

                        if (rankCells.every((value) => value === "N/A")) {
                          return "";
                        }

                        const rankCellsMarkup = rankCells
                          .map((value) => `<td>${value}</td>`)
                          .join("");

                        return `<tr>
                        <th scope="row">${ageGroup}</th>
                        ${rankCellsMarkup}
                      </tr>`;
                      })
                      .filter((row) => row.length > 0),
                  )
                  .join("")
              : distanceKeys
                  .flatMap((distanceKey) =>
                    rankLevels.flatMap((rankLevel) =>
                      sortedAgeGroups
                        .map((ageGroup) => {
                          const male = raceRankDisplayTimes.get(
                            buildRaceRankDisplayKey(
                              distanceKey,
                              ageGroup,
                              "male",
                              rankLevel,
                            ),
                          );
                          const female = raceRankDisplayTimes.get(
                            buildRaceRankDisplayKey(
                              distanceKey,
                              ageGroup,
                              "female",
                              rankLevel,
                            ),
                          );

                          if (!male && !female) {
                            return "";
                          }

                          const rankCell = showRankColumn
                            ? `<td>${formatRankLabel(rankLevel)}</td>`
                            : "";

                          if (singleGender) {
                            const selectedValue =
                              selectedGender === "male" ? male : female;

                            if (!selectedValue) {
                              return "";
                            }

                            return `<tr>
                            ${rankCell}
                            <th scope="row">${ageGroup}</th>
                            <td>${selectedValue}</td>
                          </tr>`;
                          }

                          return `<tr>
                          ${rankCell}
                          <th scope="row">${ageGroup}</th>
                          <td>${male ?? "N/A"}</td>
                          <td>${female ?? "N/A"}</td>
                        </tr>`;
                        })
                        .filter((row) => row.length > 0),
                    ),
                  )
                  .join("");

          if (!rows) {
            renderBenchmarkMessageRow(
              "No benchmark rows found for this selection.",
              columnCount,
            );
            renderChartMessage("No benchmark rows found for this selection.");
            return;
          }

          benchmarkBody.innerHTML = rows;

          renderBenchmarkChart(
            distanceKeys[0],
            rankLevels,
            selectedRank,
            selectedGender,
            sortedAgeGroups,
            benchmarkCaption.textContent,
          );

          updateBenchmarkView();
        };

        benchmarkView.addEventListener("change", () => {
          updateBenchmarkView();
          renderBenchmarkRows();
        });
        distanceSelect.addEventListener("change", () => {
          renderBenchmarkRows();
        });
        rankSelect.addEventListener("change", () => {
          renderBenchmarkRows();
        });
        genderFilter.addEventListener("change", () => {
          renderBenchmarkRows();
        });

        updateBenchmarkView();
        renderBenchmarkRows();

        return () => {
          renderBenchmarkRows();
        };
      };

      const initCalculator = () => {
        const distancePresetElement =
          document.getElementById("distance-presets");
        const customDistanceFieldElement = document.getElementById(
          "custom-distance-field",
        );
        const distanceInputElement = document.getElementById("distance");
        const hoursInputElement = document.getElementById("hours");
        const minutesInputElement = document.getElementById("minutes");
        const secondsInputElement = document.getElementById("seconds");
        const genderInputElement = document.getElementById("gender");
        const ageGroupInputElement = document.getElementById("age-group");
        const pacePerMileOutputElement =
          document.getElementById("pace-per-mile");
        const pacePerKilometerOutputElement =
          document.getElementById("pace-per-kilometer");
        const formattedTimeOutputElement =
          document.getElementById("formatted-time");
        const raceRankOutputElement = document.getElementById("race-rank");
        const vdotScoreOutputElement = document.getElementById("vdot-score");
        const vdotLevelOutputElement = document.getElementById("vdot-level");

        if (
          !(distancePresetElement instanceof HTMLSelectElement) ||
          !(customDistanceFieldElement instanceof HTMLElement) ||
          !(distanceInputElement instanceof HTMLInputElement) ||
          !(hoursInputElement instanceof HTMLInputElement) ||
          !(minutesInputElement instanceof HTMLInputElement) ||
          !(secondsInputElement instanceof HTMLInputElement) ||
          !(genderInputElement instanceof HTMLSelectElement) ||
          !(ageGroupInputElement instanceof HTMLSelectElement) ||
          !(pacePerMileOutputElement instanceof HTMLElement) ||
          !(pacePerKilometerOutputElement instanceof HTMLElement) ||
          !(formattedTimeOutputElement instanceof HTMLElement) ||
          !(raceRankOutputElement instanceof HTMLElement) ||
          !(vdotScoreOutputElement instanceof HTMLElement) ||
          !(vdotLevelOutputElement instanceof HTMLElement)
        ) {
          return;
        }

        const distancePresetInput = distancePresetElement;
        const customDistanceField = customDistanceFieldElement;
        const distanceInput = distanceInputElement;
        const hoursInput = hoursInputElement;
        const minutesInput = minutesInputElement;
        const secondsInput = secondsInputElement;
        const genderInput = genderInputElement;
        const ageGroupInput = ageGroupInputElement;
        const pacePerMileOutput = pacePerMileOutputElement;
        const pacePerKilometerOutput = pacePerKilometerOutputElement;
        const formattedTimeOutput = formattedTimeOutputElement;
        const raceRankOutput = raceRankOutputElement;
        const vdotScoreOutput = vdotScoreOutputElement;
        const vdotLevelOutput = vdotLevelOutputElement;

        const updateCalculator = () => {
          const usingCustomDistance = distancePresetInput.value === "custom";
          customDistanceField.hidden = !usingCustomDistance;
          distanceInput.disabled = !usingCustomDistance;

          const presetMeters = Number.parseFloat(distancePresetInput.value);
          const distanceMeters = usingCustomDistance
            ? readNumber(distanceInput)
            : presetMeters;
          const hours = readDurationPart(hoursInput);
          const minutes = readDurationPart(minutesInput);
          const seconds = readDurationPart(secondsInput);
          const totalSeconds = Math.max(
            0,
            hours * 3600 + minutes * 60 + seconds,
          );

          formattedTimeOutput.textContent = formatTime(totalSeconds);

          if (totalSeconds === 0 || distanceMeters === 0) {
            pacePerMileOutput.textContent = "00:00:00 / mi";
            pacePerKilometerOutput.textContent = "00:00:00 / km";
            raceRankOutput.textContent = "N/A";
            vdotScoreOutput.textContent = "N/A";
            vdotLevelOutput.textContent = "N/A";
            return;
          }

          const miles = distanceMeters / 1609.344;
          const kilometers = distanceMeters / 1000;
          const secondsPerMile = totalSeconds / miles;
          const secondsPerKilometer = totalSeconds / kilometers;

          pacePerMileOutput.textContent = `${formatPace(secondsPerMile)} / mi`;
          pacePerKilometerOutput.textContent = `${formatPace(secondsPerKilometer)} / km`;

          const vdot = calculateVdot(distanceMeters, totalSeconds);

          if (vdot === null) {
            vdotScoreOutput.textContent = "N/A";
            vdotLevelOutput.textContent = "N/A";
          } else {
            vdotScoreOutput.textContent = vdot.toFixed(1);
            vdotLevelOutput.textContent = classifyVdot(
              vdot,
              genderInput.value as GenderValue,
            );
          }

          if (raceRankDataFailed) {
            raceRankOutput.textContent = "Rank data unavailable";
            return;
          }

          if (!raceRankDataLoaded) {
            raceRankOutput.textContent = "Loading rank data...";
            return;
          }

          const rankDistanceKey = getRankDistanceKey(
            distancePresetInput.value,
            usingCustomDistance,
          );

          if (!rankDistanceKey) {
            raceRankOutput.textContent = "N/A for this distance";
            return;
          }

          const rankLookupKey = buildRaceRankKey(
            rankDistanceKey,
            ageGroupInput.value,
            genderInput.value,
          );
          const thresholds = raceRankThresholds.get(rankLookupKey);

          if (!thresholds) {
            raceRankOutput.textContent = "Rank not found";
            return;
          }

          raceRankOutput.textContent = classifyRaceRank(
            totalSeconds,
            thresholds,
          );
        };

        distancePresetInput.addEventListener("change", updateCalculator);

        [distanceInput, hoursInput, minutesInput, secondsInput].forEach(
          (input) => {
            input.addEventListener("input", updateCalculator);
          },
        );
        [genderInput, ageGroupInput].forEach((input) => {
          input.addEventListener("change", updateCalculator);
        });

        updateCalculator();

        return updateCalculator;
      };

      const initPage = async () => {
        const updateCalculator = initCalculator();
        const refreshBenchmarks = initBenchmarks();

        await loadRaceRankData();

        if (updateCalculator) {
          updateCalculator();
        }

        if (refreshBenchmarks) {
          refreshBenchmarks();
        }
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          void initPage();
        });
      } else {
        void initPage();
      }
