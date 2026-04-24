import { Chart, registerables, type ChartDataset } from "chart.js";

Chart.register(...registerables);

type RankThresholds = {
  beginner: number;
  novice: number;
  intermediate: number;
  advanced: number;
  elite: number;
};

type RankLevel = "beginner" | "novice" | "intermediate" | "advanced" | "elite";

type VdotLevel = {
  label: string;
  men: number;
  women: number;
  description: string;
};

type Gender = "male" | "female";

type Distance = "5k" | "10k" | "half-marathon" | "marathon";

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
    description: "International-level potential with exceptional race speed",
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

const classifyVdot = (vdot: number, gender: Gender): string => {
  const targetKey = gender === "male" ? "men" : "women";

  for (const level of vdotLevels.slice().reverse()) {
    if (vdot >= level[targetKey]) {
      return level.label;
    }
  }

  return "Below Beginner";
};

const distanceLabels: Record<string, string> = {
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
  const value = input.valueAsNumber;
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

const buildRaceRankKey = (distance: string, ageGroup: string, gender: string) =>
  `${distance}|${ageGroup}|${gender}`;

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

const classifyRaceRank = (timeSeconds: number, thresholds: RankThresholds) => {
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
    const response = await fetch(`${import.meta.env.BASE_URL}data/race-ranks.csv`);

    if (!response.ok) {
      throw new Error(`Failed to load CSV (${response.status})`);
    }

    const text = await response.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

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

      raceRankThresholds.set(buildRaceRankKey(distance, ageGroup, gender), {
        beginner: beginnerSeconds,
        novice: noviceSeconds,
        intermediate: intermediateSeconds,
        advanced: advancedSeconds,
        elite: eliteSeconds,
      });
      raceRankDisplayTimes.set(
        buildRaceRankDisplayKey(distance, ageGroup, gender, "beginner"),
        beginner,
      );
      raceRankDisplayTimes.set(
        buildRaceRankDisplayKey(distance, ageGroup, gender, "novice"),
        novice,
      );
      raceRankDisplayTimes.set(
        buildRaceRankDisplayKey(distance, ageGroup, gender, "intermediate"),
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
  const benchmarkView = document.getElementById(
    "benchmark-view",
  )! as HTMLSelectElement;
  const distanceSelect = document.getElementById(
    "benchmark-distance",
  )! as HTMLSelectElement;
  const rankSelect = document.getElementById(
    "benchmark-rank",
  )! as HTMLSelectElement;
  const genderFilter = document.getElementById(
    "benchmark-gender",
  )! as HTMLSelectElement;
  const benchmarkChartWrap = document.getElementById(
    "benchmark-chart-wrap",
  )! as HTMLElement;
  const benchmarkChart = document.getElementById(
    "benchmark-chart",
  )! as HTMLCanvasElement;
  const benchmarkChartSummary = document.getElementById(
    "benchmark-chart-summary",
  )! as HTMLElement;
  const benchmarkTableWrap = document.getElementById(
    "benchmark-table-wrap",
  )! as HTMLElement;
  const benchmarkBody = document.getElementById(
    "benchmark-body",
  )! as HTMLTableSectionElement;
  const benchmarkCaption = document.getElementById(
    "benchmark-caption",
  )! as HTMLTableCaptionElement;
  const benchmarkTable = benchmarkBody.closest("table")! as HTMLTableElement;
  const benchmarkHeadRow = benchmarkTable.querySelector(
    "thead tr",
  )! as HTMLTableRowElement;

  type ChartSeries = {
    label: string;
    color: string;
    valuesByAge: Map<string, number>;
    criticalByAge: Map<string, string>;
  };

  type BenchmarkDataset = ChartDataset<"line", (number | null)[]> & {
    benchmarkMeta: {
      criticalByIndex: Map<number, string>;
    };
  };

  let benchmarkChartInstance: Chart<"line", (number | null)[], string> | null =
    null;

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

  const renderChartMessage = (message: string) => {
    benchmarkChartSummary.textContent = message;

    if (benchmarkChartInstance) {
      benchmarkChartInstance.destroy();
      benchmarkChartInstance = null;
    }
  };

  const updateBenchmarkView = () => {
    const showChart = benchmarkView.value === "chart";
    benchmarkChartWrap.hidden = !showChart;
    benchmarkTableWrap.hidden = showChart;
  };

  const createChartSeries = (
    distanceKey: Distance,
    rankLevels: RankLevel[],
    selectedRank: string,
    selectedGender: string,
    sortedAgeGroups: string[],
  ): ChartSeries[] => {
    const genders: Gender[] =
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
            .filter(
              (point): point is { ageGroup: string; seconds: number } =>
                point !== null,
            );

          if (points.length === 0) {
            return null;
          }

          let fastestPoint = points[0];
          let slowestPoint = points[0];

          for (const point of points) {
            if (point.seconds < fastestPoint.seconds) {
              fastestPoint = point;
            }

            if (point.seconds > slowestPoint.seconds) {
              slowestPoint = point;
            }
          }

          const valuesByAge = new Map(
            points.map((point) => [point.ageGroup, point.seconds]),
          );
          const criticalByAge = new Map<string, string>();

          criticalByAge.set(fastestPoint.ageGroup, "Critical: fastest");

          if (slowestPoint.ageGroup === fastestPoint.ageGroup) {
            criticalByAge.set(
              slowestPoint.ageGroup,
              "Critical: fastest and slowest",
            );
          } else {
            criticalByAge.set(slowestPoint.ageGroup, "Critical: slowest");
          }

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
            valuesByAge,
            criticalByAge,
          };
        }),
      )
      .filter((series): series is ChartSeries => series !== null);
  };

  const renderBenchmarkChart = (
    distanceKey: Distance,
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

    const visibleAges = sortedAgeGroups.filter((ageGroup) =>
      series.some((entry) => entry.valuesByAge.has(ageGroup)),
    );

    if (visibleAges.length === 0) {
      renderChartMessage("No chart data found for this selection.");
      return;
    }

    if (benchmarkChartInstance) {
      benchmarkChartInstance.destroy();
    }

    const datasets = series.map((entry): BenchmarkDataset => {
      const data = visibleAges.map(
        (ageGroup) => entry.valuesByAge.get(ageGroup) ?? null,
      );
      const criticalByIndex = new Map<number, string>();

      visibleAges.forEach((ageGroup, index) => {
        const criticalLabel = entry.criticalByAge.get(ageGroup);

        if (criticalLabel) {
          criticalByIndex.set(index, criticalLabel);
        }
      });

      return {
        label: entry.label,
        data,
        borderColor: entry.color,
        backgroundColor: entry.color,
        tension: 0.25,
        spanGaps: true,
        pointHoverRadius: 6,
        pointRadius: (context) => {
          const dataset = context.dataset as BenchmarkDataset;
          return dataset.benchmarkMeta.criticalByIndex.has(context.dataIndex)
            ? 5
            : 3;
        },
        benchmarkMeta: {
          criticalByIndex,
        },
      };
    });

    benchmarkChartInstance = new Chart<"line", (number | null)[], string>(
      benchmarkChart,
      {
        type: "line",
        data: {
          labels: visibleAges,
          datasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2,
          interaction: {
            mode: "nearest",
            intersect: false,
          },
          plugins: {
            legend: {
              position: "bottom",
            },
            tooltip: {
              callbacks: {
                title: (items) => {
                  const ageGroup = items[0]?.label;
                  return ageGroup ? `Age Group: ${ageGroup}` : "Age Group";
                },
                label: (context) => {
                  const seconds = context.parsed.y;

                  if (typeof seconds !== "number") {
                    return `${context.dataset.label}: N/A`;
                  }

                  return `${context.dataset.label}: ${formatTime(seconds)}`;
                },
                afterLabel: (context) => {
                  const dataset = context.dataset as BenchmarkDataset;
                  return (
                    dataset.benchmarkMeta.criticalByIndex.get(
                      context.dataIndex,
                    ) ?? ""
                  );
                },
              },
            },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: "Age Group",
              },
            },
            y: {
              title: {
                display: true,
                text: "Finish Time",
              },
              ticks: {
                callback: (value) => formatTime(Number(value)),
              },
            },
          },
        },
      },
    );

    benchmarkChartSummary.textContent = `${captionText}. Hover points for details; lower times are faster.`;
  };

  const setBenchmarkHeader = (columns: string[]) => {
    benchmarkHeadRow.innerHTML = columns
      .map((column) => `<th scope="col">${column}</th>`)
      .join("");
  };

  const renderBenchmarkMessageRow = (message: string, columnCount: number) => {
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
            ? benchmarkRankOrder.map((rankLevel) => formatRankLabel(rankLevel))
            : [selectedGender === "male" ? "Men" : "Women"]),
        ]
      : [...(showRankColumn ? ["Rank"] : []), "Age Group", "Men", "Women"];
    const columnCount = benchmarkColumns.length;

    setBenchmarkHeader(benchmarkColumns);

    if (raceRankDataFailed) {
      benchmarkCaption.textContent = "Race rank benchmark data unavailable";
      renderBenchmarkMessageRow("Unable to load benchmark data.", columnCount);
      renderChartMessage("Unable to load benchmark data.");
      return;
    }

    if (!raceRankDataLoaded) {
      benchmarkCaption.textContent = "Loading benchmark data...";
      renderBenchmarkMessageRow("Loading benchmark data...", columnCount);
      renderChartMessage("Loading benchmark data...");
      return;
    }

    const distanceKeys: Distance[] = [selectedDistance as Distance];
    const rankLevels: RankLevel[] =
      selectedRank === "all" ? benchmarkRankOrder : [selectedRank as RankLevel];

    if (
      distanceKeys.some((distanceKey) => !distanceLabels[distanceKey]) ||
      rankLevels.length === 0
    ) {
      benchmarkCaption.textContent = "Pace times by age group";
      renderBenchmarkMessageRow("Select supported filters.", columnCount);
      renderChartMessage("Select supported filters.");
      return;
    }

    const distanceText = distanceLabels[selectedDistance as Distance];
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
                  const gender = selectedGender as Gender;
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
  const distancePresetInput = document.getElementById(
    "distance-presets",
  )! as HTMLSelectElement;
  const customDistanceField = document.getElementById(
    "custom-distance-field",
  )! as HTMLElement;
  const distanceInput = document.getElementById(
    "distance",
  )! as HTMLInputElement;
  const hoursInput = document.getElementById("hours")! as HTMLInputElement;
  const minutesInput = document.getElementById("minutes")! as HTMLInputElement;
  const secondsInput = document.getElementById("seconds")! as HTMLInputElement;
  const genderInput = document.getElementById("gender")! as HTMLSelectElement;
  const ageGroupInput = document.getElementById(
    "age-group",
  )! as HTMLSelectElement;
  const pacePerMileOutput = document.getElementById(
    "pace-per-mile",
  )! as HTMLElement;
  const pacePerKilometerOutput = document.getElementById(
    "pace-per-kilometer",
  )! as HTMLElement;
  const formattedTimeOutput = document.getElementById(
    "formatted-time",
  )! as HTMLElement;
  const raceRankOutput = document.getElementById("race-rank")! as HTMLElement;
  const vdotScoreOutput = document.getElementById("vdot-score")! as HTMLElement;
  const vdotLevelOutput = document.getElementById("vdot-level")! as HTMLElement;

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
    const totalSeconds = Math.max(0, hours * 3600 + minutes * 60 + seconds);

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
        genderInput.value as Gender,
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

    raceRankOutput.textContent = classifyRaceRank(totalSeconds, thresholds);
  };

  distancePresetInput.addEventListener("change", updateCalculator);

  [distanceInput, hoursInput, minutesInput, secondsInput].forEach((input) => {
    input.addEventListener("input", updateCalculator);
  });
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

  updateCalculator();
  refreshBenchmarks();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void initPage();
  });
} else {
  void initPage();
}
