// import { ThreeDots } from "react-loader-spinner";

import LoadingBar from "react-top-loading-bar";

export default function Loader() {
    return (
        <div>
            <LoadingBar color="#059669" shadow={true} progress={100} height={3} />
            {/* <ThreeDots
                visible={true}
                height="80"
                width="80"
                color="#4fa94d"
                radius="9"
                ariaLabel="three-dots-loading"
                wrapperStyle={{}}
                wrapperClass=""
            /> */}


        </div>
    )
}
