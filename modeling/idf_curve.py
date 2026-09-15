from idf_engine import get_intensity


def generate_idf_curve():

    durations = list(range(5, 121))

    curves = []

    for rp in [2, 5, 10, 25, 50, 100]:

        intensities = []

        for d in durations:
            intensities.append(
                round(
                    get_intensity(d, str(rp)),
                    3
                )
            )

        curves.append({
            "return_period": rp,
            "intensity": intensities
        })

    return {
        "duration": durations,
        "curves": curves
    }