import vegaEmbed from "vega-embed";
import raceRanks from "../data/race-ranks.json";
import { RaceRanksSchema } from "../data/schemas";

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

const benchmarkDistanceOrder: Distance[] = [
  "5k",
  "10k",
  "half-marathon",
  "marathon",
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

const loadRaceRankData = () => {
  try {
    const validatedRaceRanks = RaceRanksSchema.parse(raceRanks);

    for (const record of validatedRaceRanks) {
      const {
        distance,
        age_group: ageGroup,
        gender,
        beginner,
        novice,
        intermediate,
        advanced,
        elite,
      } = record;

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
  const benchmarkChart = document.getElementById(
    "benchmark-chart",
  )! as HTMLDivElement;
  const benchmarkChartSummary = document.getElementById(
    "benchmark-chart-summary",
  )! as HTMLElement;

  const renderChartMessage = (message: string) => {
    benchmarkChartSummary.textContent = message;
    benchmarkChart.innerHTML = "";
  };

  const createChartData = (
    sortedAgeGroups: string[],
  ): {
    age: string;
    distance: string;
    time: number;
    rank: string;
    gender: string;
    label: string;
  }[] => {
    const data: {
      age: string;
      distance: string;
      time: number;
      rank: string;
      gender: string;
      label: string;
    }[] = [];

    const genders: Gender[] = ["male", "female"];

    benchmarkDistanceOrder.forEach((distanceKey) => {
      const distanceLabel = distanceLabels[distanceKey];

      benchmarkRankOrder.forEach((rankLevel) => {
        genders.forEach((gender) => {
          const genderLabel = gender === "male" ? "Men" : "Women";

          sortedAgeGroups.forEach((ageGroup) => {
            const timeValue = raceRankDisplayTimes.get(
              buildRaceRankDisplayKey(distanceKey, ageGroup, gender, rankLevel),
            );
            const seconds = timeValue
              ? parseClockTimeToSeconds(timeValue)
              : null;

            if (seconds !== null) {
              data.push({
                age: ageGroup,
                distance: distanceLabel,
                time: seconds,
                rank: formatRankLabel(rankLevel),
                gender: genderLabel,
                label: `${distanceLabel} ${formatRankLabel(rankLevel)} ${genderLabel}`,
              });
            }
          });
        });
      });
    });

    return data;
  };

  const renderBenchmarkChart = (sortedAgeGroups: string[]) => {
    const data = createChartData(sortedAgeGroups);

    if (data.length === 0) {
      renderChartMessage("No chart data found for this selection.");
      return;
    }

    const spec = {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      data: { values: data },
      params: [
        {
          name: "selectedDistance",
          value: "5K",
          bind: {
            input: "select",
            options: ["All", "5K", "10K", "Half Marathon", "Marathon"],
            name: "Distance: ",
          },
        },
        {
          name: "selectedRank",
          value: "All",
          bind: {
            input: "select",
            options: [
              "All",
              "Beginner",
              "Novice",
              "Intermediate",
              "Advanced",
              "Elite",
            ],
            name: "Rank: ",
          },
        },
        {
          name: "selectedGender",
          value: "All",
          bind: {
            input: "select",
            options: ["All", "Men", "Women"],
            name: "Gender: ",
          },
        },
      ],
      transform: [
        {
          filter:
            "selectedDistance === 'All' || datum.distance === selectedDistance",
        },
        { filter: "selectedRank === 'All' || datum.rank === selectedRank" },
        {
          filter: "selectedGender === 'All' || datum.gender === selectedGender",
        },
        {
          calculate:
            "format(floor(datum.time / 3600), '02d') + ':' + format(floor((datum.time % 3600) / 60), '02d') + ':' + format(floor(datum.time % 60), '02d')",
          as: "timeLabel",
        },
      ],
      mark: { type: "line" as const, point: true },
      encoding: {
        x: { field: "age", type: "ordinal", title: "Age Group" },
        y: {
          field: "time",
          type: "quantitative",
          title: "Finish Time",
          axis: {
            labelExpr:
              "format(floor(datum.value / 3600), '02d') + ':' + format(floor((datum.value % 3600) / 60), '02d') + ':' + format(floor(datum.value % 60), '02d')",
          },
        },
        color: { field: "label", type: "nominal", title: "Series" },
        tooltip: [
          { field: "distance", title: "Distance" },
          { field: "age", title: "Age Group" },
          { field: "timeLabel", title: "Time" },
          { field: "rank", title: "Rank" },
          { field: "gender", title: "Gender" },
        ],
      },
      width: 700,
      height: 350,
    };

    vegaEmbed(benchmarkChart, spec as any, { actions: false })
      .then(() => {
        benchmarkChartSummary.textContent =
          "Use the native chart controls to filter distance, rank, and gender. Hover points for details; lower times are faster.";
      })
      .catch((error) => {
        console.error("Vega-Lite error:", error);
        renderChartMessage("Error rendering chart.");
      });
  };

  const renderBenchmarks = () => {
    if (raceRankDataFailed) {
      renderChartMessage("Unable to load benchmark data.");
      return;
    }

    if (!raceRankDataLoaded) {
      renderChartMessage("Loading benchmark data...");
      return;
    }

    const sortedAgeGroups = Array.from(raceRankAgeGroups).sort(
      (first, second) =>
        Number.parseInt(first, 10) - Number.parseInt(second, 10),
    );

    if (sortedAgeGroups.length === 0) {
      renderChartMessage("No chart data found for this selection.");
      return;
    }

    renderBenchmarkChart(sortedAgeGroups);
  };

  renderBenchmarks();

  return () => {
    renderBenchmarks();
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

const initPage = () => {
  const updateCalculator = initCalculator();
  const refreshBenchmarks = initBenchmarks();

  loadRaceRankData();

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
